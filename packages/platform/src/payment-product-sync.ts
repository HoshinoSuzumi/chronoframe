import { allRows } from './subscriptions.ts'
import { LIMIT_KEYS, validatePolicy } from './entitlements.ts'
import type { PlatformD1 } from './index.ts'
import type { PaymentFetch } from './payments.ts'
const names: Record<string, string> = {
  byos: 'Custom S3 storage',
  storageBytes: 'Platform storage',
  fileBytes: 'Maximum file size',
  sites: 'Sites',
  customDomains: 'Custom domains',
  photos: 'Photographs',
  monthlyBytes: 'Monthly uploads',
}
function allowance(key: string, value: number) {
  if (key === 'byos') return value ? 'Included' : 'Not included'
  if (key.endsWith('Bytes')) {
    if (!value) return '0 B'
    const i = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)))
    return `${Number((value / 1024 ** i).toFixed(2))} ${['B', 'KiB', 'MiB', 'GiB'][i]}`
  }
  return String(value)
}
function condition(c: any): string {
  if (c.all) return '(' + c.all.map(condition).join(' AND ') + ')'
  if (c.any) return '(' + c.any.map(condition).join(' OR ') + ')'
  const fields: Record<string, string> = {
    storageMode: 'Storage type',
    workspaceAgeDays: 'Workspace age in days',
    emailVerified: 'Verified email',
  }
  return `${fields[c.field]} ${{ eq: '=', gte: '≥', lte: '≤' }[c.op as 'eq']} ${c.value}`
}
export function paymentProductSnapshot(plan: any, interval: number) {
  const policy = validatePolicy(JSON.parse(plan.policy_json)),
    price = interval === 1 ? plan.monthly_price : plan.quarterly_price
  const description = [
    plan.description || plan.name,
    '',
    ...LIMIT_KEYS.map((k) => `${names[k]}: ${allowance(k, policy.limits[k])}`),
    ...policy.rules.map(
      (r) =>
        `When ${condition(r.when)}: ${Object.entries(r.limits)
          .map(([k, v]) => `${names[k]} ${allowance(k, Number(v))}`)
          .join('; ')}`,
    ),
  ].join('\n')
  return {
    planId: plan.id,
    interval,
    policy,
    product: {
      name: `${plan.name} · ${interval === 1 ? 'Monthly' : 'Quarterly'}`,
      description,
      price,
      currency: plan.currency,
      billing_type: 'recurring',
      billing_period: interval === 1 ? 'every-month' : 'every-three-months',
      tax_mode: 'inclusive',
      tax_category: 'saas',
    },
  }
}
/** Compatibility boundary for retired Creem synchronization. */
export async function queuePaymentProductSync(_db: PlatformD1) {
  /* Retired: never enqueue Creem work. */
}
export async function paymentProductSyncStatus(db: PlatformD1) {
  return allRows<any>(
    db.prepare(
      "SELECT p.id AS plan_id,p.name,i.period AS interval,CASE WHEN j.desired_revision IS NOT p.revision OR j.catalog_revision IS NOT s.catalog_revision THEN 'pending' ELSE COALESCE(j.state,'pending') END AS state,j.error,j.product_id,j.attempts,j.updated_at FROM platform_plans p CROSS JOIN (SELECT 1 AS period UNION ALL SELECT 3) i CROSS JOIN platform_payment_settings s LEFT JOIN platform_payment_product_sync j ON j.plan_id=p.id AND j.interval=i.period WHERE s.id=1 ORDER BY p.sort_order,p.id,i.period",
    ),
  )
}
/** Retired synchronization never reads credentials or contacts a provider. */
export async function syncPaymentProducts(
  _db: PlatformD1,
  _root: string,
  _transport: PaymentFetch = fetch,
  _now = Date.now(),
  _limit = 2,
) {
  return { processed: 0 }
}
