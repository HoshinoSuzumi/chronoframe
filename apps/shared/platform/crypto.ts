import type { EmailCodeCrypto } from '../../../packages/core/src/email-auth'

/** The secret is server-only and must be independently configured for each environment. */
export async function createEmailCodeCrypto(
  secret: string,
): Promise<EmailCodeCrypto> {
  if (new TextEncoder().encode(secret).length < 32)
    throw new Error('A strong email code MAC secret is required')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return {
    randomId: () => crypto.randomUUID(),
    randomCode() {
      // Rejection sampling avoids modulo bias across the million six-digit codes.
      const buffer = new Uint32Array(1)
      const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000
      do {
        crypto.getRandomValues(buffer)
      } while (buffer[0]! >= limit)
      return String(buffer[0]! % 1_000_000).padStart(6, '0')
    },
    async mac(parts) {
      const bytes = new TextEncoder().encode(JSON.stringify(parts))
      const signature = await crypto.subtle.sign('HMAC', key, bytes)
      return Array.from(new Uint8Array(signature), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
    },
  }
}

// Conservative cost for Workers deployments that enforce the Web Crypto PBKDF2 cap.
export const VISITOR_PBKDF2_ITERATIONS = 100_000
/** Derive a portable PBKDF2-SHA256 verifier; callers must use a unique salt per policy. */
export async function visitorPasswordHash(
  password: string,
  salt: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: VISITOR_PBKDF2_ITERATIONS,
    },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
