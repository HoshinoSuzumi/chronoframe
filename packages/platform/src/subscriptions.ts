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
export function validateSignupPromotion(value: unknown) {
  const p = value as Record<string, unknown>
  if (
    !p ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.trim().length > 120 ||
    typeof p.planId !== 'string' ||
    !p.planId ||
    typeof p.enabled !== 'boolean' ||
    !Number.isSafeInteger(p.endsAt) ||
    Number(p.endsAt) < 0 ||
    (p.startsAt !== null &&
      (!Number.isSafeInteger(p.startsAt) ||
        Number(p.startsAt) < 0 ||
        Number(p.startsAt) >= Number(p.endsAt))) ||
    !Number.isSafeInteger(p.priority) ||
    Math.abs(Number(p.priority)) > 10000
  )
    throw new SubscriptionError(400, 'invalid_signup_promotion')
  return {
    name: p.name.trim(),
    planId: p.planId,
    enabled: p.enabled,
    startsAt: p.startsAt as number | null,
    endsAt: Number(p.endsAt),
    priority: Number(p.priority),
    duration: duration(p.duration),
  }
}
/** Captured before the user insert and persisted with that row, never accepted from signup input. */
export async function signupOfferForRegistration(
  db: PlatformD1,
  registeredAt: number,
) {
  const offer = await db
    .prepare(
      `SELECT p.id,p.name,COALESCE(p.plan_id,${NEW_PLAN_SQL}) AS plan_id,p.duration_unit,p.duration_value,p.revision FROM (SELECT 1) seed LEFT JOIN platform_signup_promotions p ON p.id=(SELECT candidate.id FROM platform_signup_promotions candidate JOIN platform_plans plan ON plan.id=candidate.plan_id AND plan.active=1 WHERE candidate.enabled=1 AND candidate.created_at<=? AND (candidate.starts_at IS NULL OR candidate.starts_at<=?) AND candidate.ends_at>? ORDER BY candidate.priority DESC,candidate.created_at DESC,candidate.id LIMIT 1)`,
    )
    .bind(registeredAt, registeredAt, registeredAt)
    .first<{
      id: string | null
      name: string | null
      plan_id: string
      duration_unit: Duration['unit'] | null
      duration_value: number | null
      revision: number | null
    }>()
  if (!offer) throw new SubscriptionError(503, 'signup_offer_unavailable')
  const term: Duration = offer.id
    ? {
        unit: offer.duration_unit!,
        ...(offer.duration_value === null
          ? {}
          : { value: offer.duration_value }),
      }
    : { unit: 'permanent' }
  return JSON.stringify({
    promotionId: offer.id,
    promotionName: offer.name,
    promotionRevision: offer.revision,
    planId: offer.plan_id,
    startsAt: registeredAt,
    expiresAt: durationEnd(registeredAt, term),
    source: offer.id ? 'promotion' : 'default',
  })
}
export async function ensureDefaultSubscription(
  db: PlatformD1,
  workspaceId: number,
) {
  const owner = await db
    .prepare(
      'SELECT u.signup_offer FROM platform_workspaces w JOIN platform_users u ON u.id=w.owner_user_id WHERE w.id=?',
    )
    .bind(workspaceId)
    .first<{ signup_offer: string | null }>()
  if (owner?.signup_offer) {
    const offer = JSON.parse(owner.signup_offer) as {
      planId: string
      startsAt: number
      expiresAt: number | null
      source: string
      promotionId: string | null
    }
    const id = crypto.randomUUID()
    await db.batch([
      db
        .prepare(
          "INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) SELECT ?,?,?,'null',?,? WHERE NOT EXISTS(SELECT 1 FROM platform_workspace_plans WHERE workspace_id=?)",
        )
        .bind(
          id,
          workspaceId,
          offer.promotionId ? 'signup_promotion' : 'signup_default',
          owner.signup_offer,
          offer.startsAt,
          workspaceId,
        ),
      db
        .prepare(
          'INSERT OR IGNORE INTO platform_workspace_plans(workspace_id,plan_id,starts_at,expires_at,source) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_subscription_events WHERE id=?)',
        )
        .bind(
          workspaceId,
          offer.planId,
          offer.startsAt,
          offer.expiresAt,
          offer.source,
          id,
        ),
    ])
  } else {
    // Legacy accounts receive the ordinary default, never a retroactive promotion.
    await db
      .prepare(
        `INSERT OR IGNORE INTO platform_workspace_plans(workspace_id,plan_id,starts_at,source) SELECT id,${NEW_PLAN_SQL},created_at,'default' FROM platform_workspaces WHERE id=?`,
      )
      .bind(workspaceId)
      .run()
  }
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
