import type { PlatformD1 } from './index.ts'
import { allRows } from './subscriptions.ts'
export const SUBSCRIPTION_SOURCES = [
  'manual',
  'activation',
  'promotion',
  'payment',
] as const
export type ExemptionRule = {
  kind: 'active-subscription' | 'ever-subscribed'
  sources: string[]
  planIds: string[]
}
export type LifecycleExemptions = {
  enabled: boolean
  match: 'any' | 'all'
  rules: ExemptionRule[]
}
export const DEFAULT_EXEMPTIONS: LifecycleExemptions = {
  enabled: true,
  match: 'any',
  rules: [
    {
      kind: 'active-subscription',
      sources: ['manual', 'activation', 'payment'],
      planIds: [],
    },
  ],
}
export function validateExemptions(value: unknown): LifecycleExemptions {
  const v = value as LifecycleExemptions
  if (
    !v ||
    typeof v.enabled !== 'boolean' ||
    !['any', 'all'].includes(v.match) ||
    !Array.isArray(v.rules) ||
    v.rules.length > 16 ||
    (v.enabled && !v.rules.length)
  )
    throw new Error('Invalid exemption rules')
  for (const r of v.rules) {
    if (
      !r ||
      !['active-subscription', 'ever-subscribed'].includes(r.kind) ||
      !Array.isArray(r.sources) ||
      !r.sources.length ||
      r.sources.length > 4 ||
      !r.sources.every((s) => SUBSCRIPTION_SOURCES.includes(s as any)) ||
      new Set(r.sources).size !== r.sources.length ||
      !Array.isArray(r.planIds) ||
      r.planIds.length > 100 ||
      !r.planIds.every(
        (p) => typeof p === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(p),
      ) ||
      new Set(r.planIds).size !== r.planIds.length
    )
      throw new Error('Invalid exemption condition')
  }
  return {
    enabled: v.enabled,
    match: v.match,
    rules: v.rules.map((r) => ({
      kind: r.kind,
      sources: [...r.sources],
      planIds: [...r.planIds],
    })),
  }
}
/** Owned grants and personally purchased recurring subscriptions qualify; borrowed membership alone never does. */
export async function accountExemption(
  db: PlatformD1,
  userId: number,
  config: LifecycleExemptions,
  now = Date.now(),
) {
  if (!config.enabled) return false
  const current = await allRows<any>(
    db
      .prepare(
        'SELECT p.*,plan.active FROM platform_workspace_plans p JOIN platform_workspaces w ON w.id=p.workspace_id JOIN platform_plans plan ON plan.id=p.plan_id WHERE w.owner_user_id=?',
      )
      .bind(userId),
  )
  current.push(
    ...(await allRows<any>(
      db
        .prepare(
          "SELECT s.plan_id,'payment' AS source,s.period_start AS starts_at,s.period_end AS expires_at,CASE WHEN p.active=1 AND s.status IN('active','trialing','scheduled_cancel','past_due') THEN 1 ELSE 0 END AS active FROM platform_payment_subscriptions s JOIN platform_payment_checkouts c ON c.id=s.checkout_id JOIN platform_plans p ON p.id=s.plan_id WHERE c.user_id=?",
        )
        .bind(userId),
    )),
  )
  const events = config.rules.some((r) => r.kind === 'ever-subscribed')
    ? await allRows<any>(
        db
          .prepare(
            'SELECT e.kind,e.before_json,e.after_json FROM platform_subscription_events e JOIN platform_workspaces w ON w.id=e.workspace_id WHERE w.owner_user_id=?',
          )
          .bind(userId),
      )
    : []
  const historical: any[] = []
  for (const e of events)
    for (const json of [e.before_json, e.after_json]) {
      try {
        const p = JSON.parse(json)
        if (p && typeof p === 'object')
          historical.push({
            plan_id: p.planId ?? p.plan_id,
            source:
              p.source ??
              (
                {
                  assigned: 'manual',
                  redeemed: 'activation',
                  signup_promotion: 'promotion',
                } as Record<string, string>
              )[e.kind],
          })
      } catch {
        throw new Error('Invalid subscription history')
      }
    }
  const matches = (r: ExemptionRule) => {
    const entries =
      r.kind === 'active-subscription'
        ? current.filter(
            (p) =>
              p.active === 1 &&
              p.starts_at <= now &&
              (p.expires_at === null || p.expires_at > now),
          )
        : current.concat(historical)
    return entries.some(
      (p) =>
        p.plan_id &&
        p.plan_id !== 'free' &&
        r.sources.includes(p.source) &&
        (!r.planIds.length || r.planIds.includes(p.plan_id)),
    )
  }
  return config.match === 'all'
    ? config.rules.every(matches)
    : config.rules.some(matches)
}
