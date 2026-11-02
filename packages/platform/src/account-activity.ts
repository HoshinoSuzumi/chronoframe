import type { PlatformD1 } from './index.ts'

export const ACCOUNT_ACTIVITY_INTERVAL = 5 * 60 * 1000

/** Authenticated API activity never restores frozen accounts or changes login timestamps. */
export async function recordAccountActivity(
  db: PlatformD1,
  userId: number,
  now = Date.now(),
) {
  if (!Number.isSafeInteger(userId) || userId < 1) return false
  const result = await db
    .prepare(
      'UPDATE platform_users SET last_active_at=? WHERE id=? AND email_verified=1 AND (last_active_at IS NULL OR last_active_at<=?) AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=platform_users.id AND c.suspended=1) AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=platform_users.id)',
    )
    .bind(now, userId, now - ACCOUNT_ACTIVITY_INTERVAL)
    .run()
  return result.meta.changes > 0
}
