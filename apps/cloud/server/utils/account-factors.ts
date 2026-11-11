import { twoFactor } from 'better-auth/plugins'
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  type DispatchContext,
} from 'better-auth/api'
import { generateRandomString, symmetricEncrypt } from 'better-auth/crypto'
import { z } from 'zod'
import { parseSetCookieHeader } from 'better-auth/cookies'
import type { PlatformD1 } from '../../../../packages/platform/src/index.ts'
import { accountTwoFactorPolicy } from '../../../../packages/platform/src/account-security.ts'
import { isSocialLoginProvider } from '../../../../packages/contracts/src/social-login.ts'

/** Keep Better Auth's challenge lifecycle, with independently configured factors. */
export function accountFactors(
  options: Parameters<typeof twoFactor>[0],
  db: PlatformD1,
) {
  const plugin = twoFactor(options)
  const credentialGate = plugin.hooks.after[0]!
  type Context = Parameters<typeof credentialGate.handler>[0] & DispatchContext
  const method = z.enum(['totp', 'otp'])
  const emailEntry = (path: string | undefined) =>
    ['/sign-in/email-otp', '/email-otp/verify-email'].includes(path ?? '')
  const socialEntry = (ctx: {
    path?: string
    params?: Record<string, unknown>
  }) =>
    (ctx.path === '/callback/:id' && isSocialLoginProvider(ctx.params?.id)) ||
    (!!ctx.path?.startsWith('/callback/') &&
      isSocialLoginProvider(ctx.path.slice('/callback/'.length)))

  /** Require a live session and a password, or recent sign-in for passwordless accounts. */
  const settingsSession = createAuthMiddleware(async (ctx) => {
    const session = await getAuthoritativeSessionFromCtx(ctx)
    if (!session) throw new APIError('UNAUTHORIZED')
    const credential = await ctx.context.internalAdapter.findCredentialAccount(
      session.user.id,
    )
    if (credential?.password) {
      if (
        typeof ctx.body?.password !== 'string' ||
        !ctx.body.password ||
        ctx.body.password.length > 128
      )
        throw new APIError('BAD_REQUEST', {
          code: 'INVALID_PASSWORD',
          message: 'Confirm your password.',
        })
      await ctx.context.password.checkPassword(session.user.id, ctx)
    } else if (
      Date.now() - new Date(session.session.createdAt).getTime() >=
      ctx.context.sessionConfig.freshAge * 1000
    ) {
      throw new APIError('FORBIDDEN', {
        code: 'SESSION_NOT_FRESH',
        message: 'Sign in again before changing security settings.',
      })
    }
    return { session }
  })

  /** Resolve only a live, signed pending challenge; never accept a client user ID. */
  async function pendingUser(ctx: Context) {
    if (!ctx.getSignedCookie) return null
    const cookie = ctx.context.createAuthCookie('two_factor')
    const identifier = await ctx.getSignedCookie(
      cookie.name,
      ctx.context.secret,
    )
    if (!identifier) return null
    const pending =
      await ctx.context.internalAdapter.findVerificationValue(identifier)
    if (!pending || new Date(pending.expiresAt).getTime() <= Date.now())
      return null
    return { userId: pending.value, identifier }
  }

  /** Bind allowed factors to the server-recorded primary proof for this challenge. */
  async function pendingPolicy(
    ctx: Context,
    pending: { userId: string; identifier: string },
  ) {
    const primary = await ctx.context.internalAdapter.findVerificationValue(
      `account-primary:${pending.identifier}`,
    )
    if (
      !primary ||
      new Date(primary.expiresAt).getTime() <= Date.now() ||
      !['email', 'other'].includes(primary.value)
    )
      throw new APIError('UNAUTHORIZED')
    const policy = await accountTwoFactorPolicy(db, pending.userId)
    if (primary.value === 'email') {
      policy.methods = policy.methods.filter((method) => method !== 'otp')
      policy.preferredMethod =
        policy.preferredMethod === 'totp' && policy.methods.includes('totp')
          ? 'totp'
          : null
      policy.defaultMethod = policy.methods.includes('totp') ? 'totp' : null
    }
    return policy
  }

  /** Email-only users also receive encrypted, single-use recovery codes. */
  async function ensureRecoveryCodes(ctx: Context, userId: string) {
    const codes = Array.from({ length: 10 }, () => {
      const value = generateRandomString(10, 'a-z', '0-9', 'A-Z')
      return `${value.slice(0, 5)}-${value.slice(5)}`
    })
    const encrypt = (data: string) =>
      symmetricEncrypt({ key: ctx.context.secretConfig, data })
    const result = await db
      .prepare(`INSERT OR IGNORE INTO platform_two_factors
      (user_id, secret, backup_codes, verified) VALUES (?, ?, ?, 0)`)
      .bind(
        Number(userId),
        await encrypt(generateRandomString(32)),
        await encrypt(JSON.stringify(codes)),
      )
      .run()
    return result.meta.changes ? codes : undefined
  }

  return {
    ...plugin,
    endpoints: {
      ...plugin.endpoints,
      factorMethods: createAuthEndpoint(
        '/two-factor/methods',
        { method: 'POST' },
        async (ctx) => {
          const pending = await pendingUser(ctx)
          if (!pending) throw new APIError('UNAUTHORIZED')
          const policy = await pendingPolicy(ctx, pending)
          if (!policy.methods.length) throw new APIError('UNAUTHORIZED')
          return ctx.json(policy)
        },
      ),
      preferredFactor: createAuthEndpoint(
        '/two-factor/preferred',
        {
          method: 'POST',
          body: z.object({
            method: method.nullable(),
            password: z.string().max(128).optional(),
          }),
          use: [settingsSession],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const changed = await db
            .prepare(`UPDATE platform_users SET preferred_two_factor_method = ?
          WHERE id = ? AND (? IS NULL OR (? = 'otp' AND email_two_factor_enabled = 1)
            OR (? = 'totp' AND EXISTS (SELECT 1 FROM platform_two_factors WHERE user_id = platform_users.id AND verified = 1))) RETURNING id`)
            .bind(
              ctx.body.method,
              Number(userId),
              ctx.body.method,
              ctx.body.method,
              ctx.body.method,
            )
            .first()
          if (!changed)
            throw new APIError('BAD_REQUEST', {
              code: 'FACTOR_NOT_ENABLED',
              message: 'Configure this method first.',
            })
          return ctx.json(await accountTwoFactorPolicy(db, userId))
        },
      ),
      removeFactor: createAuthEndpoint(
        '/two-factor/remove-method',
        {
          method: 'POST',
          body: z.object({
            method,
            password: z.string().max(128).optional(),
            confirmDisable: z.boolean().default(false),
          }),
          use: [settingsSession],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id
          const policy = await accountTwoFactorPolicy(db, userId)
          if (!policy.methods.includes(ctx.body.method))
            throw new APIError('BAD_REQUEST', {
              code: 'FACTOR_NOT_ENABLED',
              message: 'This method is not configured.',
            })
          if (policy.methods.length === 1 && !ctx.body.confirmDisable)
            throw new APIError('BAD_REQUEST', {
              code: 'LAST_FACTOR',
              message: 'Confirm disabling two-factor authentication.',
            })
          if (ctx.body.method === 'otp') {
            await db.batch([
              db
                .prepare(`UPDATE platform_users SET email_two_factor_enabled = 0,
              preferred_two_factor_method = CASE WHEN preferred_two_factor_method = 'otp' THEN NULL ELSE preferred_two_factor_method END,
              two_factor_enabled = EXISTS (SELECT 1 FROM platform_two_factors WHERE user_id = platform_users.id AND verified = 1) WHERE id = ?`)
                .bind(Number(userId)),
              db
                .prepare(
                  'DELETE FROM platform_two_factors WHERE user_id = ? AND verified = 0',
                )
                .bind(Number(userId)),
            ])
          } else {
            const secret = await symmetricEncrypt({
              key: ctx.context.secretConfig,
              data: generateRandomString(32),
            })
            await db.batch([
              db
                .prepare(
                  'UPDATE platform_two_factors SET verified = 0, secret = ?, failed_verification_count = 0, locked_until = NULL WHERE user_id = ?',
                )
                .bind(secret, Number(userId)),
              db
                .prepare(`UPDATE platform_users SET two_factor_enabled = email_two_factor_enabled,
              preferred_two_factor_method = CASE WHEN preferred_two_factor_method = 'totp' THEN NULL ELSE preferred_two_factor_method END WHERE id = ?`)
                .bind(Number(userId)),
              db
                .prepare(
                  'DELETE FROM platform_two_factors WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM platform_users WHERE id = ? AND email_two_factor_enabled = 1)',
                )
                .bind(Number(userId), Number(userId)),
            ])
          }
          return ctx.json(await accountTwoFactorPolicy(db, userId))
        },
      ),
    },
    hooks: {
      ...plugin.hooks,
      before: [
        {
          matcher: (ctx: { path?: string }) =>
            !!ctx.path?.startsWith('/two-factor/'),
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.body && typeof ctx.body === 'object')
              ctx.body.trustDevice = false
            if (
              [
                '/two-factor/enable',
                '/two-factor/disable',
                '/two-factor/generate-backup-codes',
              ].includes(ctx.path ?? '')
            ) {
              await settingsSession(ctx)
              if (ctx.path === '/two-factor/generate-backup-codes') {
                const session = await getAuthoritativeSessionFromCtx(ctx)
                if (session) {
                  const policy = await accountTwoFactorPolicy(
                    db,
                    session.user.id,
                  )
                  if (policy.methods.length)
                    await ensureRecoveryCodes(ctx, session.user.id)
                }
              }
              return
            }
            if (
              ![
                '/two-factor/send-otp',
                '/two-factor/verify-otp',
                '/two-factor/verify-totp',
                '/two-factor/verify-backup-code',
              ].includes(ctx.path ?? '')
            )
              return
            const session = await getAuthoritativeSessionFromCtx(ctx)
            const pending = session ? null : await pendingUser(ctx)
            if (pending) {
              const policy = await pendingPolicy(ctx, pending)
              const required = ctx.path?.endsWith('totp') ? 'totp' : 'otp'
              if (
                ctx.path === '/two-factor/verify-backup-code'
                  ? !policy.hasRecoveryCodes
                  : !policy.methods.includes(required)
              )
                throw new APIError('FORBIDDEN', {
                  code: 'FACTOR_NOT_ENABLED',
                  message: 'Use a configured verification method.',
                })
            } else {
              // Email verification with a session can otherwise implicitly enable 2FA.
              if (session && ctx.path !== '/two-factor/verify-totp') {
                const policy = await accountTwoFactorPolicy(db, session.user.id)
                if (
                  !policy.methods.includes('otp') &&
                  ctx.path !== '/two-factor/verify-backup-code'
                )
                  throw new APIError('FORBIDDEN', {
                    code: 'FACTOR_NOT_ENABLED',
                    message: 'Configure email verification first.',
                  })
              }
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx: { path?: string }) =>
            ['/two-factor/enable', '/two-factor/disable'].includes(
              ctx.path ?? '',
            ),
          handler: createAuthMiddleware(async (ctx) => {
            const response = ctx.context.returned as
              | { method?: string; status?: boolean }
              | undefined
            const userId =
              ctx.context.newSession?.user.id ?? ctx.context.session?.user.id
            if (!userId) return
            if (response?.method === 'otp') {
              await db
                .prepare(
                  'UPDATE platform_users SET email_two_factor_enabled = 1 WHERE id = ?',
                )
                .bind(Number(userId))
                .run()
              const backupCodes = await ensureRecoveryCodes(ctx, userId)
              return ctx.json({
                ...response,
                ...(backupCodes ? { backupCodes } : {}),
              })
            }
            if (ctx.path === '/two-factor/disable' && response?.status === true)
              await db
                .prepare(
                  'UPDATE platform_users SET email_two_factor_enabled = 0, preferred_two_factor_method = NULL WHERE id = ?',
                )
                .bind(Number(userId))
                .run()
          }),
        },
        {
          matcher: (ctx: Parameters<typeof credentialGate.matcher>[0]) =>
            ctx.path === '/sign-in/social' ||
            credentialGate.matcher(ctx) ||
            emailEntry(ctx.path) ||
            socialEntry(ctx),
          handler: Object.assign(
            async (input: Parameters<typeof credentialGate.handler>[0]) => {
              const ctx = input as Context
              const user = ctx.context.newSession?.user
              const userId = user?.id
              if (emailEntry(ctx.path)) {
                if (
                  !user ||
                  !('twoFactorEnabled' in user) ||
                  !user.twoFactorEnabled
                )
                  return { response: undefined, headers: undefined }
                try {
                  const policy = await accountTwoFactorPolicy(db, user.id)
                  if (!policy.methods.includes('totp'))
                    return { response: undefined, headers: undefined }
                } catch (error) {
                  // A failed policy lookup must still revoke the primary session.
                  await credentialGate.handler(ctx)
                  throw error
                }
              }
              const callback = ctx.context.responseHeaders?.get('location')
              const result: unknown = await credentialGate.handler(ctx)
              if (
                !result ||
                typeof result !== 'object' ||
                !('response' in result)
              )
                return result
              const challenge = result.response
              if (
                !challenge ||
                typeof challenge !== 'object' ||
                !('twoFactorRedirect' in challenge) ||
                challenge.twoFactorRedirect !== true ||
                !userId
              )
                return result
              // Gate first: a failed preference lookup must never leave the
              // primary sign-in session authenticated without a second factor.
              const headers = new Headers(
                'headers' in result && result.headers instanceof Headers
                  ? result.headers
                  : undefined,
              )
              const cookieName = ctx.context.createAuthCookie('two_factor').name
              const signedCookie = parseSetCookieHeader(
                headers.get('set-cookie') ?? '',
              ).get(cookieName)?.value
              const identifier = signedCookie?.slice(
                0,
                signedCookie.lastIndexOf('.'),
              )
              const verification = identifier
                ? await ctx.context.internalAdapter.findVerificationValue(
                    identifier,
                  )
                : null
              if (!identifier || !verification || verification.value !== userId)
                throw new APIError('UNAUTHORIZED')
              await ctx.context.internalAdapter.createVerificationValue({
                identifier: `account-primary:${identifier}`,
                value: emailEntry(ctx.path) ? 'email' : 'other',
                expiresAt: verification.expiresAt,
              })
              const policy = await pendingPolicy(ctx, { userId, identifier })
              if (socialEntry(ctx)) {
                const target = new URL('/signin', ctx.context.baseURL)
                target.searchParams.set(
                  'second',
                  policy.defaultMethod === 'totp' ? 'totp' : 'email',
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
                headers.set('location', target.toString())
                return {
                  response: new APIError('FOUND', undefined, {
                    location: target.toString(),
                  }),
                  headers,
                }
              }
              return {
                ...result,
                response: {
                  ...challenge,
                  twoFactorMethods: policy.methods,
                  preferredTwoFactorMethod: policy.defaultMethod,
                  hasRecoveryCodes: policy.hasRecoveryCodes,
                },
              }
            },
            { options: credentialGate.handler.options },
          ),
        },
      ],
    },
  }
}
