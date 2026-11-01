import type { PlatformD1 } from './index.ts'
import { SOCIAL_LOGIN_PROVIDERS } from '../../contracts/src/social-login.ts'
import { socialLoginProviders } from './social-login.ts'
export type LinkedLoginAccount = {
  id: string
  provider: string
  canUnlink: boolean
}
type AccountRow = { id: number; provider: string; hasPassword: number }
async function accounts(db: PlatformD1, userId: number) {
  const row = await db
    .prepare(
      "SELECT COALESCE(json_group_array(json_object('id',id,'provider',provider_id,'hasPassword',CASE WHEN password IS NOT NULL AND password<>'' THEN 1 ELSE 0 END)), '[]') AS items FROM (SELECT id,provider_id,password FROM platform_accounts WHERE user_id=? ORDER BY id)",
    )
    .bind(userId)
    .first<{ items: string }>()
  return JSON.parse(row?.items ?? '[]') as AccountRow[]
}
export async function accountConnections(
  db: PlatformD1,
  secret: string,
  userId: number,
) {
  const enabled = Object.keys(await socialLoginProviders(db, secret))
  const linked = await accounts(db, userId)
  const usable = (account: AccountRow) =>
    account.provider === 'credential'
      ? !!account.hasPassword
      : enabled.includes(account.provider)
  return {
    providers: SOCIAL_LOGIN_PROVIDERS.filter((p) => enabled.includes(p.id)).map(
      (p) => ({ id: p.id, name: p.name, icon: p.icon }),
    ),
    accounts: linked
      .filter((a) => a.provider !== 'credential')
      .map((a) => ({
        id: String(a.id),
        provider: a.provider,
        canUnlink: linked.some((other) => other.id !== a.id && usable(other)),
      })),
  }
}
/** One atomic delete preserves another usable login method even for simultaneous unlink requests. */
export async function unlinkLoginAccount(
  db: PlatformD1,
  secret: string,
  userId: number,
  id: unknown,
) {
  if (
    typeof id !== 'string' ||
    !/^[1-9][0-9]{0,15}$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  )
    return false
  const enabled = Object.keys(await socialLoginProviders(db, secret))
  const placeholders = enabled.map(() => '?').join(',') || 'NULL'
  const row = await db
    .prepare(
      `DELETE FROM platform_accounts
       WHERE id=? AND user_id=? AND provider_id<>'credential'
       AND EXISTS (
         SELECT 1 FROM platform_accounts other
         WHERE other.user_id=? AND other.id<>platform_accounts.id
         AND (
           (other.provider_id='credential' AND other.password IS NOT NULL AND other.password<>'')
           OR (other.provider_id IN (${placeholders}) AND EXISTS (
             SELECT 1 FROM platform_social_login_providers p
             WHERE p.provider=other.provider_id AND p.client_id<>'' AND p.credentials_ciphertext<>''
           ))
         )
       ) RETURNING id`,
    )
    .bind(Number(id), userId, userId, ...enabled)
    .first<{ id: number }>()
  return !!row
}
