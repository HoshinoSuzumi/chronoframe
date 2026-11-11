import type { PlatformD1 } from './index.ts'
import {
  defaultTwoFactorMethod,
  type TwoFactorMethod,
  type TwoFactorPolicy,
} from '../../contracts/src/account-security.ts'

/** Read current factor enrollment from D1, including while a sign-in is pending. */
export async function accountTwoFactorPolicy(
  db: PlatformD1,
  userId: string | number,
): Promise<TwoFactorPolicy> {
  const row = await db
    .prepare(`
    SELECT u.two_factor_enabled AS enabled,
      u.email_two_factor_enabled AS emailEnabled,
      u.preferred_two_factor_method AS preferred,
      f.verified AS authenticator, f.id AS recovery
    FROM platform_users u LEFT JOIN platform_two_factors f ON f.user_id = u.id
    WHERE u.id = ?
  `)
    .bind(Number(userId))
    .first<{
      enabled: number
      emailEnabled: number
      preferred: TwoFactorMethod | null
      authenticator: number | null
      recovery: number | null
    }>()
  const methods: TwoFactorMethod[] = []
  if (row?.enabled) {
    if (row.authenticator) methods.push('totp')
    if (row.emailEnabled) methods.push('otp')
  }
  const preferredMethod =
    row?.preferred && methods.includes(row.preferred) ? row.preferred : null
  return {
    methods,
    preferredMethod,
    defaultMethod: defaultTwoFactorMethod(methods, preferredMethod),
    hasRecoveryCodes: !!row?.enabled && !!row.recovery,
  }
}
