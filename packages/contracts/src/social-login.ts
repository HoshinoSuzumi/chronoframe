/** Microsoft is excluded until email ownership can be established independently.
 * Provider identifiers are fixed; arbitrary OAuth endpoints cannot be configured. */
export const SOCIAL_LOGIN_PROVIDERS = [
  { id: 'github', name: 'GitHub', icon: 'i-tabler-brand-github' },
  { id: 'google', name: 'Google', icon: 'i-tabler-brand-google' },
  { id: 'discord', name: 'Discord', icon: 'i-tabler-brand-discord' },
] as const
export type SocialLoginProvider = (typeof SOCIAL_LOGIN_PROVIDERS)[number]['id']
export interface SocialLoginCredentials {
  clientId: string
  clientSecret: string
}
export function isSocialLoginProvider(
  value: unknown,
): value is SocialLoginProvider {
  return SOCIAL_LOGIN_PROVIDERS.some((provider) => provider.id === value)
}
export function parseSocialLoginCredentials(
  value: unknown,
): SocialLoginCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid login credentials')
  const { clientId, clientSecret } = value as Record<string, unknown>
  if (
    [clientId, clientSecret].some(
      (v) =>
        typeof v !== 'string' ||
        !v.trim() ||
        v.length > 4096 ||
        [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
    )
  )
    throw new Error('Complete login credentials are required')
  return {
    clientId: (clientId as string).trim(),
    clientSecret: (clientSecret as string).trim(),
  }
}
const encoder = new TextEncoder()
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value))
const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
/** Dedicated key derivation; credentials are authenticated to provider and revision. */
export async function socialLoginCipher(secret: string) {
  if (secret.length < 32)
    throw new Error('Login credential encryption unavailable')
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('chronoframe-social-login-v1'),
      info: encoder.encode('credentials'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return {
    async seal(value: SocialLoginCredentials, context: string) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
        key,
        encoder.encode(JSON.stringify(value)),
      )
      return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`
    },
    async open(
      value: string,
      context: string,
    ): Promise<SocialLoginCredentials> {
      const [version, iv, body, ...extra] = value.split('.')
      if (
        version !== 'v1' ||
        !iv ||
        !body ||
        extra.length ||
        value.length > 24576
      )
        throw new Error('Invalid login credential envelope')
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decode(iv),
          additionalData: encoder.encode(context),
        },
        key,
        decode(body),
      )
      return parseSocialLoginCredentials(
        JSON.parse(new TextDecoder().decode(decrypted)),
      )
    },
  }
}
