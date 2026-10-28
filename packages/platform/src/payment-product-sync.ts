import type { PlatformD1 } from './index.ts'
import { allRows, SubscriptionError } from './subscriptions.ts'
import { LIMIT_KEYS, validatePolicy } from './entitlements.ts'
import {
  creemRequest,
  paymentSecrets,
  paymentSettings,
  type PaymentFetch,
} from './payments.ts'
const enc = new TextEncoder()
async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
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
/** Source revisions are scanned durably, so a process crash after a plan save cannot lose synchronization. */
export async function queuePaymentProductSync(db: PlatformD1) {
  await db
    .prepare(
      "INSERT INTO platform_payment_product_sync(plan_id,interval,desired_revision,catalog_revision) SELECT p.id,i.period,p.revision,s.catalog_revision FROM platform_plans p CROSS JOIN (SELECT 1 AS period UNION ALL SELECT 3) i CROSS JOIN platform_payment_settings s WHERE s.id=1 ON CONFLICT(plan_id,interval) DO UPDATE SET desired_revision=excluded.desired_revision,catalog_revision=excluded.catalog_revision,state='pending',attempts=0,available_at=0,error=NULL WHERE desired_revision<>excluded.desired_revision OR catalog_revision<>excluded.catalog_revision",
    )
    .run()
}
export async function paymentProductSyncStatus(db: PlatformD1) {
  return allRows<any>(
    db.prepare(
      "SELECT p.id AS plan_id,p.name,i.period AS interval,CASE WHEN j.desired_revision IS NOT p.revision OR j.catalog_revision IS NOT s.catalog_revision THEN 'pending' ELSE COALESCE(j.state,'pending') END AS state,j.error,j.product_id,j.attempts,j.updated_at FROM platform_plans p CROSS JOIN (SELECT 1 AS period UNION ALL SELECT 3) i CROSS JOIN platform_payment_settings s LEFT JOIN platform_payment_product_sync j ON j.plan_id=p.id AND j.interval=i.period WHERE s.id=1 ORDER BY p.sort_order,p.id,i.period",
    ),
  )
}
/** The lease and both source revisions fence publication; existing subscription prices are never mutated. */
export async function syncPaymentProducts(
  db: PlatformD1,
  root: string,
  transport: PaymentFetch = fetch,
  now = Date.now(),
  limit = 2,
) {
  const settings = await paymentSettings(db)
  if (!settings.configured || !settings.autoSync) return { processed: 0 }
  const credentials = await paymentSecrets(db, root),
    credentialHash = await hash(credentials.apiKey)
  await queuePaymentProductSync(db)
  // Non-purchasable plans need no network calls and must not consume the paid-job budget.
  const inactive =
    'EXISTS(SELECT 1 FROM platform_plans p WHERE p.id=plan_id AND (p.active=0 OR p.listed=0 OR CASE WHEN interval=1 THEN p.monthly_price ELSE p.quarterly_price END IS NULL OR CASE WHEN interval=1 THEN p.monthly_price ELSE p.quarterly_price END=0))'
  await db.batch([
    db.prepare(
      `UPDATE platform_payment_products SET enabled=0,revision=revision+1 WHERE enabled<>0 AND ${inactive}`,
    ),
    db
      .prepare(
        `UPDATE platform_payment_product_sync SET state='disabled',error=NULL,updated_at=? WHERE state<>'disabled' AND (lease_until IS NULL OR lease_until<?) AND ${inactive}`,
      )
      .bind(now, now),
  ])
  await db
    .prepare(
      "UPDATE platform_payment_product_sync SET state='failed',error='payment_product_sync_exhausted',lease_token=NULL,lease_until=NULL WHERE state='syncing' AND attempts>=8 AND (lease_until IS NULL OR lease_until<?)",
    )
    .bind(now)
    .run()
  const jobs = await allRows<any>(
    db
      .prepare(
        "SELECT * FROM platform_payment_product_sync WHERE state IN('pending','syncing') AND attempts<8 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY available_at,plan_id,interval LIMIT ?",
      )
      .bind(now, now, Math.max(1, Math.min(20, limit))),
  )
  let processed = 0
  const wallStart = Date.now(),
    clock = () => now + Date.now() - wallStart
  for (const job of jobs) {
    const token = crypto.randomUUID(),
      started = clock()
    const claim = await db
      .prepare(
        "UPDATE platform_payment_product_sync SET state='syncing',lease_token=?,lease_until=?,attempts=attempts+1 WHERE plan_id=? AND interval=? AND desired_revision=? AND catalog_revision=? AND state IN('pending','syncing') AND attempts<8 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING attempts",
      )
      .bind(
        token,
        started + 60000,
        job.plan_id,
        job.interval,
        job.desired_revision,
        job.catalog_revision,
        started,
        started,
      )
      .first<any>()
    if (!claim) continue
    const fence =
      "EXISTS(SELECT 1 FROM platform_payment_product_sync j JOIN platform_plans p ON p.id=j.plan_id CROSS JOIN platform_payment_settings s WHERE j.plan_id=? AND j.interval=? AND j.lease_token=? AND j.lease_until>? AND j.state='syncing' AND j.desired_revision=p.revision AND j.catalog_revision=s.catalog_revision AND s.id=1 AND s.auto_sync=1 AND j.desired_revision=? AND j.catalog_revision=?)"
    const fenced = () => [
      job.plan_id,
      job.interval,
      token,
      clock(),
      job.desired_revision,
      job.catalog_revision,
    ]
    try {
      const plan = await db
        .prepare('SELECT * FROM platform_plans WHERE id=?')
        .bind(job.plan_id)
        .first<any>()
      if (!plan || plan.revision !== job.desired_revision) continue
      const snapshot = paymentProductSnapshot(plan, job.interval),
        body = snapshot.product
      if (
        !plan.active ||
        !plan.listed ||
        body.price === null ||
        body.price === 0
      ) {
        await db.batch([
          db
            .prepare(
              `UPDATE platform_payment_products SET enabled=0,revision=revision+1 WHERE plan_id=? AND interval=? AND ${fence}`,
            )
            .bind(plan.id, job.interval, ...fenced()),
          db
            .prepare(
              `UPDATE platform_payment_product_sync SET state='disabled',error=NULL,updated_at=? WHERE plan_id=? AND interval=? AND ${fence}`,
            )
            .bind(clock(), plan.id, job.interval, ...fenced()),
        ])
        processed++
        continue
      }
      if (!Number.isSafeInteger(body.price) || body.price < 100)
        throw new SubscriptionError(400, 'payment_product_minimum_price')
      const snapshotJSON = JSON.stringify(snapshot),
        businessHash = await hash(snapshotJSON),
        syncHash = await hash(snapshotJSON + credentialHash)
      const mapping = await db
        .prepare(
          'SELECT * FROM platform_payment_products WHERE plan_id=? AND interval=?',
        )
        .bind(plan.id, job.interval)
        .first<any>()
      let productId: string | undefined = mapping?.product_id
      const samePrice =
        mapping?.price === body.price && mapping?.currency === body.currency
      if (mapping?.sync_hash !== syncHash) {
        let existing: any
        if (samePrice && productId) {
          try {
            existing = await creemRequest(
              credentials,
              '/v1/products?product_id=' + encodeURIComponent(productId),
              undefined,
              transport,
            )
          } catch (e) {
            if (
              Number((e as { providerStatus?: number }).providerStatus) !== 404
            )
              throw e
          }
        }
        if (
          existing?.mode === 'test' &&
          existing.id === productId &&
          existing.price === body.price &&
          existing.currency === body.currency &&
          existing.billing_type === 'recurring' &&
          existing.billing_period === body.billing_period &&
          !Number(existing.trial_period_days ?? 0) &&
          !existing.usage_prices?.length &&
          (!existing.status || existing.status === 'active')
        ) {
          await creemRequest(
            credentials,
            '/v1/products/' + encodeURIComponent(productId!),
            { name: body.name, description: body.description },
            transport,
            { method: 'PATCH' },
          )
        } else {
          const created = await creemRequest(
            credentials,
            '/v1/products',
            body,
            transport,
            { idempotencyKey: 'cfp_' + businessHash },
          )
          if (
            typeof created?.id !== 'string' ||
            !/^prod_[a-zA-Z0-9_-]{1,150}$/.test(created.id)
          )
            throw new SubscriptionError(502, 'payment_product_response_invalid')
          productId = created.id
        }
        let actual = await creemRequest(
          credentials,
          '/v1/products?product_id=' + encodeURIComponent(productId!),
          undefined,
          transport,
        )
        if (
          actual.id !== productId ||
          actual.mode !== 'test' ||
          actual.price !== body.price ||
          actual.currency !== body.currency ||
          actual.billing_type !== 'recurring' ||
          actual.billing_period !== body.billing_period ||
          (actual.status && actual.status !== 'active') ||
          Number(actual.trial_period_days ?? 0) > 0 ||
          actual.usage_prices?.length
        )
          throw new SubscriptionError(422, 'payment_product_mismatch')
        // An idempotent create can return a product whose description was edited later.
        if (
          actual.name !== body.name ||
          actual.description !== body.description
        ) {
          await creemRequest(
            credentials,
            '/v1/products/' + encodeURIComponent(productId!),
            { name: body.name, description: body.description },
            transport,
            { method: 'PATCH' },
          )
          actual = await creemRequest(
            credentials,
            '/v1/products?product_id=' + encodeURIComponent(productId!),
            undefined,
            transport,
          )
          if (
            actual.id !== productId ||
            actual.mode !== 'test' ||
            actual.price !== body.price ||
            actual.currency !== body.currency ||
            actual.billing_type !== 'recurring' ||
            actual.billing_period !== body.billing_period ||
            (actual.status && actual.status !== 'active') ||
            Number(actual.trial_period_days ?? 0) > 0 ||
            actual.usage_prices?.length ||
            actual.name !== body.name ||
            actual.description !== body.description
          )
            throw new SubscriptionError(422, 'payment_product_mismatch')
        }
      }
      if (!productId)
        throw new SubscriptionError(502, 'payment_product_response_invalid')
      await db.batch([
        db
          .prepare(
            `INSERT INTO platform_payment_product_versions(product_id,plan_id,interval,price,currency,snapshot_json,sync_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT(product_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,sync_hash=excluded.sync_hash,updated_at=excluded.updated_at`,
          )
          .bind(
            productId,
            plan.id,
            job.interval,
            body.price,
            body.currency,
            snapshotJSON,
            syncHash,
            clock(),
            clock(),
            ...fenced(),
          ),
        db
          .prepare(
            `INSERT INTO platform_payment_products(plan_id,interval,product_id,price,currency,enabled,sync_hash) SELECT ?,?,?,?,?,1,? WHERE ${fence} ON CONFLICT(plan_id,interval) DO UPDATE SET product_id=excluded.product_id,price=excluded.price,currency=excluded.currency,enabled=1,sync_hash=excluded.sync_hash,revision=platform_payment_products.revision+1`,
          )
          .bind(
            plan.id,
            job.interval,
            productId,
            body.price,
            body.currency,
            syncHash,
            ...fenced(),
          ),
        db
          .prepare(
            `UPDATE platform_payment_product_sync SET state='synced',product_id=?,sync_hash=?,error=NULL,updated_at=? WHERE plan_id=? AND interval=? AND ${fence}`,
          )
          .bind(
            productId,
            syncHash,
            clock(),
            plan.id,
            job.interval,
            ...fenced(),
          ),
      ])
      processed++
    } catch (e) {
      const code =
        e instanceof SubscriptionError ? e.code : 'payment_product_sync_failed'
      const providerStatus = Number(
        (e as { providerStatus?: number })?.providerStatus,
      )
      const diagnostic =
        code +
        (Number.isInteger(providerStatus) &&
        providerStatus >= 100 &&
        providerStatus <= 599
          ? ':' + providerStatus
          : '')
      await db
        .prepare(
          "UPDATE platform_payment_product_sync SET state=?,error=?,available_at=?,updated_at=? WHERE plan_id=? AND interval=? AND lease_token=? AND state='syncing' AND desired_revision=? AND catalog_revision=?",
        )
        .bind(
          claim.attempts >= 8 ? 'failed' : 'pending',
          diagnostic,
          clock() + Math.min(3600000, 60000 * 2 ** (claim.attempts - 1)),
          clock(),
          job.plan_id,
          job.interval,
          token,
          job.desired_revision,
          job.catalog_revision,
        )
        .run()
    } finally {
      await db
        .prepare(
          'UPDATE platform_payment_product_sync SET lease_token=NULL,lease_until=NULL WHERE plan_id=? AND interval=? AND lease_token=?',
        )
        .bind(job.plan_id, job.interval, token)
        .run()
    }
  }
  return { processed }
}
