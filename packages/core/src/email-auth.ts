import { CoreError } from './errors.ts'

export const EMAIL_CODE_POLICY = Object.freeze({
  ttlMs: 10 * 60_000,
  resendAfterMs: 60_000,
  maxAttempts: 5,
  windowMs: 60 * 60_000,
  maxEmailRequests: 10,
  maxClientRequests: 30,
})
export interface EmailCodeRecord {
  id: string
  emailKey: string
  clientKey: string
  codeMac: string
  createdAt: number
  expiresAt: number
}
export interface EmailCodeStore {
  /**
   * Atomically enforce email/client request limits and resend cooldown, then
   * invalidate older challenges for this email and insert the replacement.
   * This must be shared durable storage, never process-local state in production.
   */
  reserve(
    record: EmailCodeRecord,
    policy: typeof EMAIL_CODE_POLICY,
  ): Promise<boolean>
  /** Delete only this challenge, never a newer replacement after a send failure. */
  discard(id: string): Promise<void>
  /**
   * Atomically compare the MAC, expiry and remaining attempts. Increment attempts
   * on every wrong submission, and consume on success. At most one concurrent
   * verification may return true; never reset attempts on a failed request.
   */
  consume(input: {
    id: string
    emailKey: string
    codeMac: string
    now: number
    maxAttempts: number
  }): Promise<boolean>
}
export interface EmailCodeCrypto {
  randomId(): string
  randomCode(): string
  /** Keyed MAC with a server-only secret; a plain hash exposes low-entropy codes. */
  mac(parts: readonly string[]): Promise<string>
}
export interface EmailCodeSender {
  send(input: {
    email: string
    code: string
    expiresInMinutes: number
  }): Promise<void>
}
export function normalizeSignInEmail(input: string): string {
  if (typeof input !== 'string' || input.length > 254)
    throw new CoreError(400, 'Invalid email address')
  const email = input.trim().toLowerCase()
  // Account addresses use ASCII. IDN domains can be supplied in punycode form.
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    )
  ) {
    throw new CoreError(400, 'Invalid email address')
  }
  const [local, domain] = email.split('@')
  if (
    !local ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    domain!.split('.').some((label) => label.length > 63)
  ) {
    throw new CoreError(400, 'Invalid email address')
  }
  return email
}

/** Provider-neutral verification; account provisioning and signed sessions stay in adapters. */
export function createEmailCodeSignIn(
  store: EmailCodeStore,
  crypto: EmailCodeCrypto,
  sender: EmailCodeSender,
  now = Date.now,
) {
  async function key(email: string) {
    return crypto.mac(['email-identity', email])
  }
  return {
    async request(emailInput: string, trustedClientKey: string) {
      const email = normalizeSignInEmail(emailInput)
      if (!trustedClientKey) throw new CoreError(400, 'Client context required')
      const id = crypto.randomId()
      const code = crypto.randomCode()
      if (!/^[0-9]{6}$/.test(code) || !id)
        throw new CoreError(503, 'Sign-in unavailable')
      const createdAt = now()
      const emailKey = await key(email)
      const record: EmailCodeRecord = {
        id,
        emailKey,
        clientKey: await crypto.mac(['email-client', trustedClientKey]),
        codeMac: await crypto.mac(['email-code', id, email, code]),
        createdAt,
        expiresAt: createdAt + EMAIL_CODE_POLICY.ttlMs,
      }
      if (!(await store.reserve(record, EMAIL_CODE_POLICY)))
        throw new CoreError(429, 'Please wait before requesting another code')
      try {
        await sender.send({
          email,
          code,
          expiresInMinutes: EMAIL_CODE_POLICY.ttlMs / 60_000,
        })
      } catch {
        await store.discard(id)
        // Do not expose provider errors, addresses or plaintext codes.
        throw new CoreError(503, 'Sign-in unavailable')
      }
      return {
        challengeId: id,
        expiresInSeconds: EMAIL_CODE_POLICY.ttlMs / 1000,
      }
    },
    async verify(emailInput: string, id: string, code: string) {
      const email = normalizeSignInEmail(emailInput)
      if (!id || id.length > 128 || !/^[0-9]{6}$/.test(code))
        throw new CoreError(401, 'Invalid or expired code')
      const accepted = await store.consume({
        id,
        emailKey: await key(email),
        codeMac: await crypto.mac(['email-code', id, email, code]),
        now: now(),
        maxAttempts: EMAIL_CODE_POLICY.maxAttempts,
      })
      if (!accepted) throw new CoreError(401, 'Invalid or expired code')
      return { verifiedEmail: email }
    },
  }
}
