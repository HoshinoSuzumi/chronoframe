import { twoFactor } from 'better-auth/plugins'
import {
  APIError,
  createAuthMiddleware,
  type DispatchContext,
} from 'better-auth/api'

import { isSocialLoginProvider } from '../../../../packages/contracts/src/social-login.ts'

/** Reuse Better Auth's challenge/session lifecycle for verified email-code logins too. */
export function accountFactors(options: Parameters<typeof twoFactor>[0]) {
  const emailEntry = (path: string | undefined) =>
    ['/sign-in/email-otp', '/email-otp/verify-email'].includes(path ?? '')
  const socialEntry = (ctx: {
    path?: string
    params?: Record<string, unknown>
  }) =>
    (ctx.path === '/callback/:id' && isSocialLoginProvider(ctx.params?.id)) ||
    (!!ctx.path?.startsWith('/callback/') &&
      isSocialLoginProvider(ctx.path.slice('/callback/'.length)))
  const plugin = twoFactor(options)
  const credentialGate = plugin.hooks.after[0]!
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      before: [
        {
          matcher: (ctx: { path?: string }) =>
            !!ctx.path?.startsWith('/two-factor/'),
          handler: createAuthMiddleware(async (ctx) => {
            // This portal does not offer remembered-device bypasses.
            if (ctx.body && typeof ctx.body === 'object')
              ctx.body.trustDevice = false
            if (
              !['/two-factor/send-otp', '/two-factor/verify-otp'].includes(
                ctx.path ?? '',
              )
            )
              return
            const cookie = ctx.context.createAuthCookie('two_factor')
            const identifier = await ctx.getSignedCookie(
              cookie.name,
              ctx.context.secret,
            )
            if (!identifier) return
            const pending =
              await ctx.context.internalAdapter.findVerificationValue(
                identifier,
              )
            if (!pending) return
            const authenticator = await ctx.context.adapter.findOne<{
              verified: boolean
            }>({
              model: 'twoFactor',
              where: [{ field: 'userId', value: pending.value }],
            })
            // A second email code cannot replace a connected authenticator.
            if (authenticator?.verified)
              throw new APIError('FORBIDDEN', {
                code: 'AUTHENTICATOR_REQUIRED',
                message: 'Use your authenticator or a recovery code.',
              })
          }),
        },
      ],
      after: [
        {
          matcher: (ctx: Parameters<typeof credentialGate.matcher>[0]) =>
            ctx.path === '/sign-in/social' ||
            credentialGate.matcher(ctx) ||
            emailEntry(ctx.path) ||
            socialEntry(ctx),
          handler: Object.assign(
            async (input: Parameters<typeof credentialGate.handler>[0]) => {
              const ctx = input as typeof input & DispatchContext
              if (emailEntry(ctx.path)) {
                const userId = ctx.context.newSession?.user.id
                if (!userId) return { response: undefined, headers: undefined }
                const authenticator = await ctx.context.adapter.findOne<{
                  verified: boolean
                }>({
                  model: 'twoFactor',
                  where: [{ field: 'userId', value: userId }],
                })
                if (!authenticator?.verified)
                  return { response: undefined, headers: undefined }
              }
              const callback = ctx.context.responseHeaders?.get('location')
              const result = await credentialGate.handler(ctx)
              const challenge = result.response as
                | { twoFactorRedirect?: boolean; twoFactorMethods?: string[] }
                | undefined
              if (socialEntry(ctx) && challenge?.twoFactorRedirect) {
                const target = new URL('/signin', ctx.context.baseURL)
                target.searchParams.set(
                  'second',
                  challenge.twoFactorMethods?.includes('totp')
                    ? 'totp'
                    : 'email',
                )
                if (callback) {
                  const destination = new URL(callback, ctx.context.baseURL)
                  if (destination.origin === target.origin)
                    target.searchParams.set(
                      'next',
                      destination.pathname +
                        destination.search +
                        destination.hash,
                    )
                }
                const headers = new Headers(result.headers)
                headers.set('location', target.toString())
                return {
                  response: new APIError('FOUND', undefined, {
                    location: target.toString(),
                  }),
                  headers,
                }
              }
              return result
            },
            { options: credentialGate.handler.options },
          ),
        },
      ],
    },
  }
}
