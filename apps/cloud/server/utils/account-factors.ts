import { twoFactor } from 'better-auth/plugins'
import {
  APIError,
  createAuthMiddleware,
  type DispatchContext,
} from 'better-auth/api'

/** Reuse Better Auth's challenge/session lifecycle for verified email-code logins too. */
export function accountFactors(options: Parameters<typeof twoFactor>[0]) {
  const emailEntry = (path: string | undefined) =>
    ['/sign-in/email-otp', '/email-otp/verify-email'].includes(path ?? '')
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
            credentialGate.matcher(ctx) || emailEntry(ctx.path),
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
              return credentialGate.handler(ctx)
            },
            { options: credentialGate.handler.options },
          ),
        },
      ],
    },
  }
}
