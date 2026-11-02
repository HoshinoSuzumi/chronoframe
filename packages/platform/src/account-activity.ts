import type { PlatformD1 } from './index.ts'
import { SubscriptionError } from './subscriptions.ts'

export const ACCOUNT_ACTIVITY_INTERVAL = 5 * 60 * 1000
const eligible =
  'email_verified=1 AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=platform_users.id AND c.suspended=1) AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=platform_users.id)'

/** Persist activity or a durable retry; fail only when neither can be saved safely. */
export async function recordAccountActivity(
  db: PlatformD1,
  userId: number,
  now = Date.now(),
) {
  if (!Number.isSafeInteger(userId) || userId < 1) return false
  try {
    const result = await db
      .prepare(
        `UPDATE platform_users SET last_active_at=? WHERE id=? AND (last_active_at IS NULL OR last_active_at<=?) AND ${eligible}`,
      )
      .bind(now, userId, now - ACCOUNT_ACTIVITY_INTERVAL)
      .run()
    return result.meta.changes > 0
  } catch {
    console.error('Account activity write failed')
    try {
      const queued = await db
        .prepare(
          `INSERT INTO platform_account_activity_retries(user_id,active_at) SELECT id,? FROM platform_users WHERE id=? AND ${eligible} ON CONFLICT(user_id) DO UPDATE SET active_at=MAX(platform_account_activity_retries.active_at,excluded.active_at)`,
        )
        .bind(now, userId)
        .run()
      if (queued.meta.changes) return true
    } catch {
      /* Neither activity nor its retry is durable: do not claim success. */
    }
    throw new SubscriptionError(503, 'account_activity_unavailable')
  }
}

/** Replay before scanning; atomic deletion never discards newer or unpersisted activity. */
export async function replayAccountActivity(db: PlatformD1, limit = 50) {
  await db.batch([
    db
      .prepare(
        `UPDATE platform_users SET last_active_at=MAX(COALESCE(last_active_at,0),(SELECT active_at FROM platform_account_activity_retries a WHERE a.user_id=platform_users.id)) WHERE id IN(SELECT user_id FROM platform_account_activity_retries ORDER BY active_at,user_id LIMIT ?) AND ${eligible}`,
      )
      .bind(limit),
    db
      .prepare(
        `DELETE FROM platform_account_activity_retries WHERE user_id IN(SELECT user_id FROM platform_account_activity_retries ORDER BY active_at,user_id LIMIT ?) AND (EXISTS(SELECT 1 FROM platform_users WHERE id=platform_account_activity_retries.user_id AND last_active_at>=platform_account_activity_retries.active_at) OR NOT EXISTS(SELECT 1 FROM platform_users WHERE id=platform_account_activity_retries.user_id AND ${eligible}))`,
      )
      .bind(limit),
  ])
}
