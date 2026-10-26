import type { PlatformD1, D1Statement } from './index.ts'
export async function allRows<T>(statement: D1Statement): Promise<T[]> {
  const result = await (
    statement as D1Statement & { all<R>(): Promise<{ results: R[] }> }
  ).all<T>()
  return result.results
}
export type Duration = { unit: 'permanent' | 'days' | 'months'; value?: number }
export class SubscriptionError extends Error {
  statusCode: number
  code: string
  constructor(statusCode: number, code: string) {
    super(code)
    this.statusCode = statusCode
    this.code = code
  }
}
export function duration(value: unknown): Duration {
  const d = value as Duration
  if (
    !d ||
    typeof d !== 'object' ||
    Array.isArray(d) ||
    !['permanent', 'days', 'months'].includes(d.unit)
  )
    throw new SubscriptionError(400, 'invalid_duration')
  if (d.unit === 'permanent') return { unit: 'permanent' }
  if (
    !Number.isSafeInteger(d.value) ||
    d.value! < 1 ||
    d.value! > (d.unit === 'days' ? 36500 : 1200)
  )
    throw new SubscriptionError(400, 'invalid_duration')
  return { unit: d.unit, value: d.value }
}
/** Add UTC calendar months, clamping the day without overflowing into a later month. */
export function addMonths(time: number, months: number) {
  const date = new Date(time),
    day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return date.getTime()
}
export function durationEnd(start: number, d: Duration) {
  return d.unit === 'permanent'
    ? null
    : d.unit === 'days'
      ? start + d.value! * 86400000
      : addMonths(start, d.value!)
}
/** Continue an existing calendar-month term without losing its original month-end anchor. */
export function extendDurationEnd(anchor: number, end: number, term: Duration) {
  if (term.unit !== 'months') return durationEnd(end, term)
  const a = new Date(anchor),
    e = new Date(end),
    months =
      (e.getUTCFullYear() - a.getUTCFullYear()) * 12 +
      e.getUTCMonth() -
      a.getUTCMonth()
  return months >= 0 && addMonths(anchor, months) === end
    ? addMonths(anchor, months + term.value!)
    : addMonths(end, term.value!)
}
export function monthlyPeriod(
  anchor: number,
  now: number,
  end: number | null = null,
) {
  const a = new Date(anchor),
    n = new Date(now)
  let months = Math.max(
    0,
    (n.getUTCFullYear() - a.getUTCFullYear()) * 12 +
      n.getUTCMonth() -
      a.getUTCMonth(),
  )
  if (addMonths(anchor, months) > now) months--
  const start = addMonths(anchor, Math.max(0, months))
  return {
    start,
    end: Math.min(addMonths(anchor, Math.max(0, months) + 1), end ?? Infinity),
  }
}
export const EXPIRY_PLAN_SQL =
  "COALESCE((SELECT p.id FROM platform_billing_settings b JOIN platform_plans p ON p.id=b.expiry_plan_id AND p.active=1 WHERE b.id=1),'free')"
export const NEW_PLAN_SQL =
  "COALESCE((SELECT p.id FROM platform_billing_settings b JOIN platform_plans p ON p.id=b.new_plan_id AND p.active=1 WHERE b.id=1),'free')"
export async function ensureDefaultSubscription(
  db: PlatformD1,
  workspaceId: number,
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO platform_workspace_plans(workspace_id,plan_id,starts_at,source) SELECT id,${NEW_PLAN_SQL},created_at,'default' FROM platform_workspaces WHERE id=?`,
    )
    .bind(workspaceId)
    .run()
}
export async function resolveSubscription(
  db: PlatformD1,
  workspaceId: number,
  now = Date.now(),
) {
  const row = await db
    .prepare(`SELECT p.id,p.name,p.revision,p.policy_json,p.currency,p.monthly_price,p.quarterly_price,w.created_at,w.owner_user_id,COALESCE(u.email_verified,0) AS email_verified,
 COALESCE(wp.revision,0) AS assignment_revision,CASE WHEN assigned.active=1 AND wp.source<>'expired_default' AND (wp.expires_at IS NULL OR wp.expires_at>?) THEN wp.source ELSE 'default' END AS source,
 CASE WHEN assigned.active=1 AND wp.source<>'expired_default' AND (wp.expires_at IS NULL OR wp.expires_at>?) THEN wp.starts_at WHEN wp.expires_at<=? THEN wp.expires_at ELSE COALESCE(wp.starts_at,w.created_at) END AS starts_at,
 CASE WHEN assigned.active=1 AND wp.source<>'expired_default' AND (wp.expires_at IS NULL OR wp.expires_at>?) THEN wp.expires_at ELSE NULL END AS expires_at,wp.billing_interval,
 CASE WHEN wp.expires_at<=? OR assigned.active=0 OR wp.source='expired_default' THEN 1 ELSE 0 END AS expired
 FROM platform_workspaces w LEFT JOIN platform_users u ON u.id=w.owner_user_id LEFT JOIN platform_workspace_plans wp ON wp.workspace_id=w.id LEFT JOIN platform_plans assigned ON assigned.id=wp.plan_id
 JOIN platform_plans p ON p.id=CASE WHEN assigned.active=1 AND wp.source<>'expired_default' AND (wp.expires_at IS NULL OR wp.expires_at>?) THEN assigned.id ELSE ${EXPIRY_PLAN_SQL} END WHERE w.id=?`)
    .bind(now, now, now, now, now, now, workspaceId)
    .first<{
      id: string
      name: string
      revision: number
      policy_json: string
      currency: string
      monthly_price: number | null
      quarterly_price: number | null
      created_at: number
      owner_user_id: number
      email_verified: number
      assignment_revision: number
      source: string
      starts_at: number
      expires_at: number | null
      billing_interval: 1 | 3 | null
      expired: number
    }>()
  if (!row) throw new SubscriptionError(404, 'workspace_unavailable')
  const subscription = {
    source: row.source,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    interval: row.expired ? null : row.billing_interval,
    revision: row.assignment_revision,
  }
  return {
    ...row,
    subscription,
    quotaPeriod: monthlyPeriod(row.starts_at, now, row.expires_at),
  }
}
/** Execute alongside the successful grant/event write, so stale updates cannot invalidate newer work. */
export function subscriptionInvalidation(
  db: PlatformD1,
  workspaceId: number,
  eventId: string,
): D1Statement[] {
  return [
    db
      .prepare(
        'UPDATE platform_policy_epoch SET revision=revision+1 WHERE id=1 AND EXISTS(SELECT 1 FROM platform_subscription_events WHERE id=?)',
      )
      .bind(eventId),
    db
      .prepare(
        "UPDATE platform_custom_domains SET next_check_at=0 WHERE state<>'deleted' AND site_id IN(SELECT id FROM platform_sites WHERE workspace_id=?) AND EXISTS(SELECT 1 FROM platform_subscription_events WHERE id=?)",
      )
      .bind(workspaceId, eventId),
  ]
}
/** Reads enforce expiry immediately; this bounded job persists transitions and queues provider cleanup. */
export async function reconcileSubscriptions(
  db: PlatformD1,
  now = Date.now(),
  limit = 5,
) {
  const rows = await allRows<{
    workspace_id: number
    plan_id: string
    revision: number
    starts_at: number
    expires_at: number | null
  }>(
    db
      .prepare(
        `SELECT wp.* FROM platform_workspace_plans wp JOIN platform_plans p ON p.id=wp.plan_id WHERE (wp.expires_at<=? OR p.active=0) AND NOT (wp.source='expired_default' AND wp.expires_at IS NULL AND wp.plan_id=${EXPIRY_PLAN_SQL}) ORDER BY COALESCE(wp.expires_at,0),wp.workspace_id LIMIT ?`,
      )
      .bind(now, limit),
  )
  let changed = 0
  for (const row of rows) {
    const id = crypto.randomUUID(),
      after = {
        planId: (await resolveSubscription(db, row.workspace_id, now)).id,
      }
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) SELECT ?,?,'expired',?,?,? WHERE EXISTS(SELECT 1 FROM platform_workspace_plans wp JOIN platform_plans p ON p.id=wp.plan_id WHERE wp.workspace_id=? AND wp.revision=? AND (wp.expires_at<=? OR p.active=0) AND NOT (wp.source='expired_default' AND wp.expires_at IS NULL AND wp.plan_id=${EXPIRY_PLAN_SQL}))`,
        )
        .bind(
          id,
          row.workspace_id,
          JSON.stringify(row),
          JSON.stringify(after),
          now,
          row.workspace_id,
          row.revision,
          now,
        ),
      db
        .prepare(
          `UPDATE platform_workspace_plans SET plan_id=${EXPIRY_PLAN_SQL},starts_at=CASE WHEN expires_at<=? THEN expires_at ELSE starts_at END,expires_at=NULL,source='expired_default',billing_interval=NULL,revision=revision+1 WHERE workspace_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_subscription_events WHERE id=?)`,
        )
        .bind(now, row.workspace_id, row.revision, id),
      ...subscriptionInvalidation(db, row.workspace_id, id),
    ])
    changed += results[0]?.meta.changes ?? 0
  }
  await db
    .prepare('DELETE FROM platform_activation_attempts WHERE window_start<?')
    .bind(now - 86400000)
    .run()
  return { changed }
}
