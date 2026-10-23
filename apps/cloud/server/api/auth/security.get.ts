import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const session = await requirePlatformSession(
    event,
    useRuntimeConfig(event).platform,
  )
  const db = platformDatabase(event)
  const user = await db
    .prepare(
      'SELECT email, two_factor_enabled AS twoFactorEnabled FROM platform_users WHERE id = ?',
    )
    .bind(session.userId)
    .first<{ email: string; twoFactorEnabled: number }>()
  const credential = await db
    .prepare(
      "SELECT id FROM platform_accounts WHERE user_id = ? AND provider_id = 'credential' AND password IS NOT NULL",
    )
    .bind(session.userId)
    .first()
  const factor = await db
    .prepare('SELECT verified FROM platform_two_factors WHERE user_id = ?')
    .bind(session.userId)
    .first<{ verified: number }>()
  const passkeys = await db
    .prepare(
      `SELECT COALESCE(json_group_array(json_object('id', id, 'name', name, 'createdAt', created_at)), '[]') AS items
       FROM (SELECT id, name, created_at FROM platform_passkeys WHERE user_id = ? ORDER BY id DESC)`,
    )
    .bind(session.userId)
    .first<{ items: string }>()
  return {
    email: user!.email,
    hasPassword: !!credential,
    twoFactorEnabled: !!user!.twoFactorEnabled,
    hasAuthenticator: !!factor?.verified,
    passkeys: JSON.parse(passkeys?.items ?? '[]') as {
      id: number
      name: string | null
      createdAt: number
    }[],
  }
})
