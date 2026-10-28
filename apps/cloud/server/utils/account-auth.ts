import { sendMail } from '../../../../packages/platform/src/mail.ts'
import { signupOfferForRegistration } from '../../../../packages/platform/src/subscriptions.ts'
import type { PlatformD1 } from '@chronoframe/platform'
import { createD1Provisioning } from '../../../../packages/platform/src/provisioning.ts'
import 'reflect-metadata'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError } from 'better-auth/api'
import { createEmailCodeCrypto } from '../../../shared/platform/crypto.ts'
import { emailOTP } from 'better-auth/plugins'
import { accountFactors } from './account-factors.ts'
import { passkey } from '@better-auth/passkey'
import type { PlatformEmailBinding } from '../../../shared/platform/email.ts'

export interface AccountAuthConfig {
  localDevelopment?: boolean
  portalOrigin: string
  secret: string
  emailFrom: string
}
/** Request-scoped Workers/D1 auth. Existing platform user IDs and memberships stay intact. */
export function accountAuthOptions(
  database: BetterAuthOptions['database'],
  config: AccountAuthConfig,
  email: PlatformEmailBinding,
  defer?: (task: Promise<unknown>) => void,
) {
  const origin = new URL(config.portalOrigin)
  const db = database as unknown as PlatformD1
  const recordSessionActivity = async (session: {
    userId: string
    id: string
  }) => {
    const updated = await db
      .prepare(
        'UPDATE platform_users SET last_login_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=platform_users.id) RETURNING id',
      )
      .bind(Date.now(), Number(session.userId))
      .first()
    if (!updated) {
      await db
        .prepare('DELETE FROM platform_auth_sessions WHERE id=?')
        .bind(Number(session.id))
        .run()
      throw new APIError('FORBIDDEN', {
        code: 'ACCOUNT_DELETED',
        message:
          'This account has been deleted. Contact support@chronoframe.art to request restoration.',
      })
    }
  }
  return {
    appName: 'ChronoFrame Cloud',
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const registeredAt = Date.now()
            const signupOffer = await signupOfferForRegistration(
              database as unknown as PlatformD1,
              registeredAt,
            )
            return {
              data: { ...user, createdAt: new Date(registeredAt), signupOffer },
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const control = await (database as unknown as PlatformD1)
              .prepare(
                'SELECT suspended,public_reason FROM platform_account_controls WHERE user_id=?',
              )
              .bind(Number(session.userId))
              .first<{ suspended: number; public_reason: string }>()
            if (control?.suspended)
              throw new APIError('FORBIDDEN', {
                code: 'ACCOUNT_SUSPENDED',
                message:
                  control.public_reason ||
                  'Account access has been suspended. Contact support.',
              })
            const db = database as unknown as PlatformD1
            const initialWorkspace = await db
              .prepare(
                'SELECT id FROM platform_users WHERE id=? AND email_verified=1 AND signup_offer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM platform_workspaces WHERE owner_user_id=platform_users.id)',
              )
              .bind(Number(session.userId))
              .first()
            if (initialWorkspace)
              await createD1Provisioning(db).defaultWorkspace(
                Number(session.userId),
              )
            return { data: session }
          },
          after: recordSessionActivity,
        },
        update: { after: recordSessionActivity },
      },
    },
    baseURL: origin.origin,
    basePath: '/api/auth',
    secret: config.secret,
    database,
    trustedOrigins: [origin.origin],
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: 'serial' },
      backgroundTasks: defer ? { handler: defer } : undefined,
      // Every auth cookie has a browser-enforced host prefix. Avoid Better Auth
      // prepending __Secure- to our already-prefixed __Host- names.
      cookiePrefix: '__Host-chronoframe-cloud',
      useSecureCookies: false,
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
      cookies: { session_token: { name: '__Host-chronoframe-auth' } },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    user: {
      modelName: 'platform_users',
      additionalFields: {
        signupOffer: {
          type: 'string',
          fieldName: 'signup_offer',
          required: false,
          input: false,
          returned: false,
        },
      },
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      modelName: 'platform_auth_sessions',
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
      },
      expiresIn: 7 * 24 * 60 * 60,
      freshAge: 10 * 60,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: 'platform_accounts',
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'platform_verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'platform_auth_rate_limits',
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
        '/sign-up/email': { window: 60, max: 3 },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      async sendResetPassword({ user, url }) {
        await sendMail(
          db,
          email,
          'password-reset',
          user.email,
          { name: user.name, minutes: '30' },
          url,
          undefined,
          config.localDevelopment === true,
        )
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
    },
    plugins: [
      emailOTP({
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: {
          hash: async (otp) =>
            (await createEmailCodeCrypto(config.secret)).mac([
              'account-otp',
              otp,
            ]),
        },
        async sendVerificationOTP({ email: to, otp, type }) {
          const purpose =
            type === 'email-verification' ? 'verify your email' : 'sign in'
          await sendMail(
            db,
            email,
            'verification',
            to,
            { code: otp, purpose, minutes: '10' },
            undefined,
            config.emailFrom,
          )
        },
      }),
      accountFactors({
        issuer: 'ChronoFrame Cloud',
        schema: {
          user: { fields: { twoFactorEnabled: 'two_factor_enabled' } },
          twoFactor: {
            modelName: 'platform_two_factors',
            fields: {
              userId: 'user_id',
              backupCodes: 'backup_codes',
              failedVerificationCount: 'failed_verification_count',
              lockedUntil: 'locked_until',
            },
          },
        },
        otpOptions: {
          storeOTP: {
            hash: async (otp) =>
              (await createEmailCodeCrypto(config.secret)).mac([
                'account-second-factor',
                otp,
              ]),
          },
          async sendOTP({ user, otp }) {
            await sendMail(db, email, 'second-factor', user.email, {
              code: otp,
              minutes: '3',
            })
          },
        },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
      passkey({
        rpName: 'ChronoFrame Cloud',
        rpID: origin.hostname,
        origin: origin.origin,
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        registration: {
          requireSession: true,
          afterVerification: async ({ verification }) => {
            if (!verification.registrationInfo?.userVerified)
              throw new APIError('UNAUTHORIZED', {
                message: 'Passkey user verification is required',
              })
          },
        },
        authentication: {
          afterVerification: async ({ verification }) => {
            if (!verification.authenticationInfo.userVerified)
              throw new APIError('UNAUTHORIZED', {
                message: 'Passkey user verification is required',
              })
          },
        },
        schema: {
          passkey: {
            modelName: 'platform_passkeys',
            fields: {
              userId: 'user_id',
              publicKey: 'public_key',
              credentialID: 'credential_id',
              deviceType: 'device_type',
              backedUp: 'backed_up',
              createdAt: 'created_at',
            },
          },
        },
      }),
    ],
  } satisfies BetterAuthOptions
}
export function createAccountAuth(
  ...args: Parameters<typeof accountAuthOptions>
) {
  return betterAuth(accountAuthOptions(...args))
}
