/** Better Auth names email codes `otp` and authenticator codes `totp`. */
export type TwoFactorMethod = 'totp' | 'otp'

export interface TwoFactorPolicy {
  methods: TwoFactorMethod[]
  preferredMethod: TwoFactorMethod | null
  defaultMethod: TwoFactorMethod | null
  hasRecoveryCodes: boolean
}

export interface AccountSecurity extends TwoFactorPolicy {
  email: string
  hasPassword: boolean
  twoFactorEnabled: boolean
  hasAuthenticator: boolean
  emailTwoFactorEnabled: boolean
  passkeys: { id: number; name: string | null; createdAt: number }[]
}

/** Prefer an explicitly configured method, then authenticator, then email. */
export function defaultTwoFactorMethod(
  methods: readonly TwoFactorMethod[],
  preferred: TwoFactorMethod | null,
): TwoFactorMethod | null {
  if (preferred && methods.includes(preferred)) return preferred
  return methods.includes('totp')
    ? 'totp'
    : methods.includes('otp')
      ? 'otp'
      : null
}
