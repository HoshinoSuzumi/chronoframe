import type { PlatformD1 } from './index.ts'
import {
  allRows,
  resolveSubscription,
  SubscriptionError,
} from './subscriptions.ts'
export const DAY = 86400000
export async function handoverContext(
  db: PlatformD1,
  workspaceId: number,
  now = Date.now(),
) {
  const current = await resolveSubscription(db, workspaceId, now)
  if (
    !['promotion', 'activation', 'manual'].includes(current.source) ||
    !(Number(current.monthly_price) > 0 || Number(current.quarterly_price) > 0)
  )
    return null
  const upgrades = await allRows<any>(
    db
      .prepare(
        "SELECT r.to_plan FROM platform_payment_plan_rules r JOIN platform_plans p ON p.id=r.to_plan WHERE r.from_plan=? AND r.direction='upgrade' AND r.enabled=1 AND p.active=1 AND p.listed=1",
      )
      .bind(current.id),
  )
  return {
    planId: current.id,
    name: current.name,
    source: current.source,
    startsAt: current.subscription.startsAt,
    expiresAt: current.subscription.expiresAt,
    revision: current.assignment_revision,
    upgradePlans: upgrades.map((r) => r.to_plan) as string[],
  }
}
export async function checkoutHandover(
  db: PlatformD1,
  workspaceId: number,
  planId: string,
  mode: unknown,
  replace: unknown,
  now: number,
) {
  if (
    mode !== undefined &&
    !['immediate', 'after_entitlement'].includes(String(mode))
  )
    throw new SubscriptionError(400, 'payment_start_mode_invalid')
  const context = await handoverContext(db, workspaceId, now)
  if (!context) {
    if (mode === 'after_entitlement')
      throw new SubscriptionError(409, 'payment_entitlement_changed')
    return null
  }
  if (planId !== context.planId && !context.upgradePlans.includes(planId))
    throw new SubscriptionError(409, 'payment_upgrade_not_allowed')
  const chosen =
    mode ?? (planId === context.planId ? 'after_entitlement' : 'immediate')
  if (chosen === 'immediate') {
    if (planId === context.planId || replace !== true)
      throw new SubscriptionError(400, 'payment_replace_confirmation_required')
    return null
  }
  if (context.expiresAt === null)
    throw new SubscriptionError(409, 'permanent_plan_active')
  const trialDays = Math.ceil((context.expiresAt - now) / DAY)
  if (trialDays < 1 || trialDays > 10000)
    throw new SubscriptionError(409, 'payment_handover_date_unavailable')
  return { ...context, trialDays }
}
export const NO_HANDOVER = `NOT EXISTS(SELECT 1 FROM platform_payment_checkouts h WHERE h.workspace_id=? AND h.handover_json IS NOT NULL AND h.state IN('creating','open','uncertain')) AND NOT EXISTS(SELECT 1 FROM platform_payment_subscriptions h WHERE h.workspace_id=? AND h.activation_state='authorized' AND h.status NOT IN('canceled','expired','failed'))`
export async function requireNoHandover(db: PlatformD1, workspaceId: number) {
  if (
    !(await db
      .prepare(`SELECT 1 AS allowed WHERE ${NO_HANDOVER}`)
      .bind(workspaceId, workspaceId)
      .first())
  )
    throw new SubscriptionError(409, 'payment_handover_exists')
}
