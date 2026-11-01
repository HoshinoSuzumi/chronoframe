import type { PlatformD1 } from './index.ts'
import {
  SOCIAL_LOGIN_PROVIDERS,
  isSocialLoginProvider,
  parseSocialLoginCredentials,
  socialLoginCipher,
  type SocialLoginCredentials,
  type SocialLoginProvider,
} from '../../contracts/src/social-login.ts'

type ProviderRow = {
  provider: SocialLoginProvider
  client_id: string
  credentials_ciphertext: string
  revision: number
}
export class SocialLoginError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
async function providerRow(db: PlatformD1, provider: SocialLoginProvider) {
  return db
    .prepare(
      'SELECT provider,client_id,credentials_ciphertext,revision FROM platform_social_login_providers WHERE provider=?',
    )
    .bind(provider)
    .first<ProviderRow>()
}
export async function socialLoginSettings(db: PlatformD1) {
  return Promise.all(
    SOCIAL_LOGIN_PROVIDERS.map(async ({ id, name }) => {
      const row = await providerRow(db, id)
      return {
        id,
        name,
        clientId: row?.client_id ?? '',
        configured: !!row?.client_id && !!row.credentials_ciphertext,
        revision: row?.revision ?? 0,
      }
    }),
  )
}
export async function socialLoginProviders(db: PlatformD1, secret: string) {
  const result: Partial<Record<SocialLoginProvider, SocialLoginCredentials>> =
    {}
  let cipher: Awaited<ReturnType<typeof socialLoginCipher>> | undefined
  for (const { id } of SOCIAL_LOGIN_PROVIDERS) {
    const row = await providerRow(db, id)
    if (!row?.client_id || !row.credentials_ciphertext) continue
    try {
      cipher ??= await socialLoginCipher(secret)
      const credentials = await cipher.open(
        row.credentials_ciphertext,
        `${id}:${row.revision}`,
      )
      if (credentials.clientId === row.client_id) result[id] = credentials
    } catch {
      // An unreadable credential disables this provider; it must never enable a fallback.
    }
  }
  return result
}
/** Root role is rechecked inside the same batch as the revision-fenced write and redacted audit. */
export async function saveSocialLoginProvider(
  db: PlatformD1,
  secret: string,
  actor: { userId: number; role: string },
  input: Record<string, unknown>,
) {
  if (actor.role !== 'root')
    throw new SocialLoginError(403, 'Root administrator required')
  if (
    !isSocialLoginProvider(input.provider) ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 0 ||
    !['save', 'remove'].includes(String(input.operation)) ||
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 5 ||
    input.reason.length > 500
  )
    throw new SocialLoginError(400, 'Invalid login configuration')
  const provider = input.provider
  const row = await providerRow(db, provider)
  if (!row || row.revision !== input.revision)
    throw new SocialLoginError(
      409,
      'Login configuration changed; reload and try again',
    )
  let credentials: SocialLoginCredentials | undefined
  let encrypted = ''
  if (input.operation === 'save') {
    let clientSecret = input.clientSecret
    if (clientSecret === '' && row.credentials_ciphertext) {
      // Check the application identity before attempting to reuse its secret.
      if (
        typeof input.clientId !== 'string' ||
        input.clientId.trim() !== row.client_id
      )
        throw new SocialLoginError(
          400,
          'Provide a new secret when changing the client ID',
        )
      try {
        clientSecret = (
          await (
            await socialLoginCipher(secret)
          ).open(row.credentials_ciphertext, `${provider}:${row.revision}`)
        ).clientSecret
      } catch {
        throw new SocialLoginError(
          400,
          'Stored secret is unreadable; provide a new secret',
        )
      }
    }
    try {
      credentials = parseSocialLoginCredentials({
        clientId: input.clientId,
        clientSecret,
      })
    } catch {
      throw new SocialLoginError(400, 'Complete login credentials are required')
    }
    encrypted = await (
      await socialLoginCipher(secret)
    ).seal(credentials, `${provider}:${row.revision + 1}`)
  }
  const audit = (configured: boolean, revision: number) =>
    JSON.stringify({ provider, configured, revision })
  const result = await db.batch([
    db
      .prepare(
        "UPDATE platform_social_login_providers SET client_id=?,credentials_ciphertext=?,revision=revision+1,updated_at=? WHERE provider=? AND revision=? AND EXISTS(SELECT 1 FROM platform_admin_roles WHERE user_id=? AND role='root')",
      )
      .bind(
        credentials?.clientId ?? '',
        encrypted,
        Date.now(),
        provider,
        row.revision,
        actor.userId,
      ),
    db
      .prepare(
        'INSERT INTO platform_admin_audit(id,actor_id,action,target,reason,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1',
      )
      .bind(
        crypto.randomUUID(),
        actor.userId,
        `social-login-${input.operation}`,
        provider,
        input.reason.trim(),
        audit(!!row.credentials_ciphertext, row.revision),
        audit(!!credentials, row.revision + 1),
        Date.now(),
      ),
  ])
  if (!result[0]?.meta.changes)
    throw new SocialLoginError(
      409,
      'Login configuration changed or permission revoked',
    )
  return socialLoginSettings(db)
}
