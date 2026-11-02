import { platformDatabase } from '../../../shared/platform/runtime'
import { getCookie, getRequestHeaders } from 'h3'
import { cloudAccount } from '../utils/cloud-account'
import {
  recordAccountActivity,
  ACCOUNT_ACTIVITY_INTERVAL,
} from '../../../../packages/platform/src/account-activity'
/** Provide Cloud's account session to shared Site authorization, with numeric identity intact. */
export default defineEventHandler((event) => {
  event.context.platformSessionResolver = async () => {
    if (!getCookie(event, '__Host-chronoframe-auth')) return null
    const session = await (
      await cloudAccount(event)
    ).api.getSession({
      headers: new Headers(getRequestHeaders(event) as HeadersInit),
    })
    const id = Number(session?.user.id)
    if (
      !session ||
      !session.user.emailVerified ||
      !Number.isSafeInteger(id) ||
      id < 1
    )
      return null
    const db = platformDatabase(event)
    const control = await db
      .prepare(
        'SELECT COALESCE(c.suspended,0) AS suspended,u.last_active_at FROM platform_users u LEFT JOIN platform_account_controls c ON c.user_id=u.id WHERE u.id=?',
      )
      .bind(id)
      .first<{ suspended: number; last_active_at: number | null }>()
    if (!control || control.suspended) return null
    const now = Date.now()
    if (
      control.last_active_at === null ||
      control.last_active_at <= now - ACCOUNT_ACTIVITY_INTERVAL
    )
      await recordAccountActivity(db, id, now)
    return {
      userId: id,
      expiresAt: new Date(session.session.expiresAt).getTime(),
    }
  }
})
