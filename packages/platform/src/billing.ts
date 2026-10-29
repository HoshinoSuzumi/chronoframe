import { discountedPrice } from '../../contracts/src/pricing.ts'
import type { PlatformD1 } from './index.ts'
import {
  allRows,
  resolveSubscription,
  SubscriptionError,
} from './subscriptions.ts'
import { workspaceEntitlements, validatePolicy } from './entitlements.ts'
import { paymentSettings } from './payments.ts'
export const CURRENCIES = [
  'USD',
  'CNY',
  'HKD',
  'EUR',
  'GBP',
  'AUD',
  'CAD',
  'SGD',
] as const
export function validatePricing(value: unknown) {
  const p = value as Record<string, unknown>
  if (
    !p ||
    !CURRENCIES.includes(p.currency as (typeof CURRENCIES)[number]) ||
    typeof p.listed !== 'boolean' ||
    (p.featured !== undefined && typeof p.featured !== 'boolean') ||
    typeof p.description !== 'string' ||
    p.description.length > 500 ||
    !Number.isSafeInteger(p.sortOrder) ||
    Number(p.sortOrder) < -10000 ||
    Number(p.sortOrder) > 10000
  )
    throw new SubscriptionError(400, 'invalid_pricing')
  for (const key of ['monthlyPrice', 'quarterlyPrice'])
    if (
      p[key] !== null &&
      (!Number.isSafeInteger(p[key]) ||
        Number(p[key]) < 0 ||
        Number(p[key]) > 10000000000)
    )
      throw new SubscriptionError(400, 'invalid_pricing')
  for (const [priceKey, discountKey] of [
    ['monthlyPrice', 'monthlyDiscountBps'],
    ['quarterlyPrice', 'quarterlyDiscountBps'],
  ] as const) {
    const discount = p[discountKey] ?? 0
    if (
      !Number.isSafeInteger(discount) ||
      Number(discount) < 0 ||
      Number(discount) > 9999 ||
      (Number(p[priceKey]) > 0 &&
        discountedPrice(Number(p[priceKey]), Number(discount))! < 1)
    )
      throw new SubscriptionError(400, 'invalid_pricing')
  }
  return {
    currency: p.currency as string,
    monthlyPrice: p.monthlyPrice as number | null,
    quarterlyPrice: p.quarterlyPrice as number | null,
    monthlyDiscountBps: Number(p.monthlyDiscountBps ?? 0),
    quarterlyDiscountBps: Number(p.quarterlyDiscountBps ?? 0),
    listed: p.listed,
    featured: p.featured as boolean | undefined,
    description: p.description,
    sortOrder: Number(p.sortOrder),
  }
}
export async function pricingCatalog(db: PlatformD1) {
  const rows = await allRows<{
    id: string
    name: string
    policy_json: string
    currency: string
    monthly_price: number | null
    quarterly_price: number | null
    monthly_discount_bps: number
    quarterly_discount_bps: number
    description: string
    featured: number
  }>(
    db.prepare(
      'SELECT id,name,policy_json,currency,monthly_price,quarterly_price,monthly_discount_bps,quarterly_discount_bps,description,featured FROM platform_plans WHERE active=1 AND listed=1 ORDER BY sort_order,id',
    ),
  )
  const settings = await db
    .prepare('SELECT new_plan_id FROM platform_billing_settings WHERE id=1')
    .first<{ new_plan_id: string }>()
  const payment = await paymentSettings(db)
  return {
    paymentAvailable:
      payment.enabled &&
      payment.providerAvailable &&
      payment.purchaseMethod === 'payment',
    purchaseMethod: payment.enabled
      ? payment.purchaseMethod
      : 'activation_code',
    newPlanId: settings?.new_plan_id ?? 'free',
    plans: rows.map(
      ({
        policy_json,
        monthly_price,
        quarterly_price,
        monthly_discount_bps,
        quarterly_discount_bps,
        featured,
        ...row
      }) => ({
        ...row,
        featured: !!featured,
        monthlyPrice: monthly_price,
        quarterlyPrice: quarterly_price,
        monthlyDiscountBps: monthly_discount_bps,
        quarterlyDiscountBps: quarterly_discount_bps,
        monthlyEffectivePrice: discountedPrice(
          monthly_price,
          monthly_discount_bps,
        ),
        quarterlyEffectivePrice: discountedPrice(
          quarterly_price,
          quarterly_discount_bps,
        ),
        policy: validatePolicy(JSON.parse(policy_json)),
      }),
    ),
  }
}
export async function billingWorkspaces(db: PlatformD1, userId: number) {
  return allRows<{
    id: number
    name: string
    role: 'admin' | 'member'
    owned: number
  }>(
    db
      .prepare(
        "SELECT w.id,w.name,m.role,CASE WHEN w.owner_user_id=? THEN 1 ELSE 0 END AS owned FROM platform_workspaces w JOIN platform_memberships m ON m.workspace_id=w.id WHERE m.user_id=? AND m.role IN('admin','member') ORDER BY owned DESC,w.id",
      )
      .bind(userId, userId),
  )
}
export async function workspaceBilling(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  now = Date.now(),
) {
  const membership = await db
    .prepare(
      "SELECT w.id,w.name,m.role FROM platform_workspaces w JOIN platform_memberships m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=? AND m.role IN('admin','member')",
    )
    .bind(workspaceId, userId)
    .first<{ id: number; name: string; role: string }>()
  if (!membership) throw new SubscriptionError(404, 'workspace_unavailable')
  const plan = await workspaceEntitlements(db, workspaceId, 'platform', now),
    byos = await workspaceEntitlements(db, workspaceId, 'byos', now),
    current = await resolveSubscription(db, workspaceId, now),
    sites = `SELECT id FROM platform_sites WHERE workspace_id=?`
  const usage = await db
    .prepare(`SELECT (SELECT COUNT(*) FROM platform_sites WHERE workspace_id=?) AS sites,
 (SELECT COUNT(*) FROM platform_custom_domains WHERE site_id IN(${sites}) AND state<>'deleted') AS customDomains,
 (SELECT COUNT(*) FROM cloud_storage_connections WHERE site_id IN(${sites}) AND pool_id IS NULL) AS byos,
 (SELECT COUNT(*) FROM cloud_photos WHERE site_id IN(${sites}) AND deleted=0) AS photographs,
 (SELECT COUNT(*) FROM cloud_uploads WHERE site_id IN(${sites}) AND state='pending' AND expires_at>?) AS pending,
 COALESCE((SELECT SUM(bytes) FROM cloud_usage_events WHERE site_id IN(${sites}) AND created_at>=? AND created_at<?),0)+COALESCE((SELECT SUM(expected_bytes+expected_video_bytes) FROM cloud_uploads WHERE site_id IN(${sites}) AND state='pending' AND expires_at>?),0) AS monthlyBytes,
 COALESCE((SELECT SUM(u.expected_bytes+u.expected_video_bytes) FROM cloud_uploads u JOIN cloud_photos p ON p.site_id=u.site_id AND p.id=u.photo_id JOIN cloud_storage_connections c ON c.site_id=u.site_id AND c.id=u.connection_id WHERE u.site_id IN(${sites}) AND u.state='completed' AND p.deleted=0 AND c.pool_id IS NOT NULL),0)
 +COALESCE((SELECT SUM(a.bytes) FROM cloud_media_assets a JOIN cloud_photos p ON p.site_id=a.site_id AND p.id=a.photo_id JOIN cloud_storage_connections c ON c.site_id=a.site_id AND c.id=a.connection_id WHERE a.site_id IN(${sites}) AND p.deleted=0 AND c.pool_id IS NOT NULL),0)
 +COALESCE((SELECT SUM(reserved_storage_bytes) FROM cloud_uploads WHERE site_id IN(${sites}) AND state='pending' AND expires_at>?),0)
 +COALESCE((SELECT SUM(reserved_output_bytes) FROM cloud_processing_jobs WHERE site_id IN(${sites}) AND state IN('queued','running','retry_wait')),0) AS storageBytes`)
    .bind(
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      workspaceId,
      now,
      workspaceId,
      current.quotaPeriod.start,
      current.quotaPeriod.end,
      workspaceId,
      now,
      workspaceId,
      workspaceId,
      workspaceId,
      now,
      workspaceId,
    )
    .first<Record<string, number>>()
  const history = await allRows<{
    kind: string
    created_at: number
    after_json: string
  }>(
    db
      .prepare(
        'SELECT kind,created_at,after_json FROM platform_subscription_events WHERE workspace_id=? ORDER BY created_at DESC,id DESC LIMIT 10',
      )
      .bind(workspaceId),
  )
  return {
    workspace: membership,
    plan: {
      id: plan.id,
      name: plan.name,
      limits: plan.limits,
      byosLimits: byos.limits,
    },
    subscription: current.subscription,
    quotaPeriod: current.quotaPeriod,
    usage: {
      ...usage,
      photos: (usage?.photographs ?? 0) + (usage?.pending ?? 0),
    },
    history: history.map(({ after_json, ...event }) => ({
      ...event,
      grant: JSON.parse(after_json),
    })),
    paymentAvailable: false,
    serverTime: now,
  }
}
