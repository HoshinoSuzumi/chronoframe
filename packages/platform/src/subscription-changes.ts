import type { PlatformD1 } from './index.ts'
import { allRows, SubscriptionError } from './subscriptions.ts'
import { paymentMember, paymentSettings } from './payments.ts'
import {
  dodoClient,
  dodoRequest,
  rawDodoId,
  DodoProviderError,
} from './dodo-client.ts'

const invalid = (code: string, status = 409): never => {
  throw new SubscriptionError(status, code)
}
export async function paymentPlanRules(db: PlatformD1) {
  return allRows<any>(
    db.prepare(
      'SELECT r.*,a.name AS from_name,b.name AS to_name FROM platform_payment_plan_rules r JOIN platform_plans a ON a.id=r.from_plan JOIN platform_plans b ON b.id=r.to_plan ORDER BY a.sort_order,b.sort_order,a.id,b.id',
    ),
  )
}
export async function savePaymentPlanRule(
  db: PlatformD1,
  actor: number,
  input: any,
  now = Date.now(),
) {
  if (
    typeof input.fromPlan !== 'string' ||
    typeof input.toPlan !== 'string' ||
    input.fromPlan === input.toPlan ||
    !['upgrade', 'downgrade'].includes(input.direction) ||
    typeof input.enabled !== 'boolean' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 5 ||
    input.reason.length > 500
  )
    invalid('payment_change_rule_invalid', 400)
  const plans = await allRows<any>(
    db
      .prepare(
        'SELECT id FROM platform_plans WHERE id IN(?,?) AND active=1 AND listed=1 AND (monthly_price>0 OR quarterly_price>0)',
      )
      .bind(input.fromPlan, input.toPlan),
  )
  if (input.enabled && plans.length !== 2)
    invalid('payment_change_rule_invalid', 400)
  const before = await db
    .prepare(
      'SELECT * FROM platform_payment_plan_rules WHERE from_plan=? AND to_plan=?',
    )
    .bind(input.fromPlan, input.toPlan)
    .first<any>()
  if ((before?.revision ?? 0) !== input.revision) invalid('revision_conflict')
  const id = crypto.randomUUID()
  const guard =
    input.revision === 0
      ? 'NOT EXISTS(SELECT 1 FROM platform_payment_plan_rules WHERE from_plan=? AND to_plan=?)'
      : 'EXISTS(SELECT 1 FROM platform_payment_plan_rules WHERE from_plan=? AND to_plan=? AND revision=?)'
  const values = [
    input.fromPlan,
    input.toPlan,
    ...(input.revision ? [input.revision] : []),
  ]
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO platform_admin_audit(id,actor_id,action,target,reason,after_json,created_at) SELECT ?,?,'payment.plan-rule',?,?,?,? WHERE ${guard}`,
      )
      .bind(
        id,
        actor,
        input.fromPlan + ':' + input.toPlan,
        input.reason.trim(),
        JSON.stringify({
          from: input.fromPlan,
          to: input.toPlan,
          direction: input.direction,
          enabled: input.enabled,
        }),
        now,
        ...values,
      ),
    db
      .prepare(
        'INSERT INTO platform_payment_plan_rules(from_plan,to_plan,direction,enabled) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_admin_audit WHERE id=?) ON CONFLICT(from_plan,to_plan) DO UPDATE SET direction=excluded.direction,enabled=excluded.enabled,revision=platform_payment_plan_rules.revision+1',
      )
      .bind(
        input.fromPlan,
        input.toPlan,
        input.direction,
        input.enabled ? 1 : 0,
        id,
      ),
  ])
  if (!result[0]?.meta?.changes) invalid('revision_conflict')
  return { saved: true }
}
const mode = (direction: string) =>
  direction === 'upgrade'
    ? {
        proration_billing_mode: 'prorated_immediately_keep_cycle' as const,
        effective_at: 'immediately' as const,
      }
    : {
        proration_billing_mode: 'full_immediately' as const,
        effective_at: 'next_billing_date' as const,
      }

async function validateTarget(
  client: Awaited<ReturnType<typeof dodoClient>>['client'],
  target: any,
) {
  const product = await dodoRequest(() =>
    client.products.retrieve(target.product_id),
  )
  const price = product.price
  if (
    product.product_id !== target.product_id ||
    !product.is_recurring ||
    price.type !== 'recurring_price' ||
    price.price !== target.price ||
    price.currency !== target.currency ||
    price.payment_frequency_count !== target.interval ||
    price.payment_frequency_interval !== 'Month' ||
    !price.tax_inclusive ||
    (price.discount_bps ?? (price.discount ?? 0) * 100) !==
      target.discount_bps ||
    price.purchasing_power_parity ||
    (price.trial_period_days ?? 0) !== 0 ||
    product.addons?.length
  )
    invalid('payment_product_mismatch', 422)
}

async function context(
  db: PlatformD1,
  secret: string,
  user: number,
  workspace: number,
  transport: typeof fetch,
) {
  await paymentMember(db, user, workspace, true)
  const settings = await paymentSettings(db)
  if (
    !settings.enabled ||
    !settings.providerAvailable ||
    !settings.configured ||
    settings.purchaseMethod !== 'payment'
  )
    invalid('payment_unavailable', 503)
  const sub = await db
    .prepare(
      "SELECT s.* FROM platform_payment_subscriptions s JOIN platform_workspace_plans w ON w.payment_subscription_id=s.id AND w.workspace_id=s.workspace_id WHERE s.workspace_id=? AND s.provider='dodo' AND s.provider_key=? AND s.environment=? AND s.status='active' AND s.period_end>? AND w.source='payment'",
    )
    .bind(workspace, settings.currentProvider, settings.environment, Date.now())
    .first<any>()
  if (!sub) invalid('payment_active_subscription_required')
  const provider = await dodoClient(
    db,
    secret,
    settings.environment as 'test' | 'live',
    transport,
    true,
    settings.currentProvider!,
  )
  return { sub, ...provider }
}
export async function previewPaymentPlanChange(
  db: PlatformD1,
  secret: string,
  user: number,
  input: { workspaceId: number; planId: string },
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  const { sub, client, key, revision } = await context(
    db,
    secret,
    user,
    input.workspaceId,
    transport,
  )
  const budget = await db
    .prepare(
      'INSERT INTO platform_payment_requests(user_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
    )
    .bind(user, Math.floor(now / 60000) * 60000)
    .first<any>()
  if (budget.attempts > 10) invalid('payment_rate_limited', 429)
  if (
    await db
      .prepare(
        "SELECT id FROM platform_payment_plan_changes WHERE workspace_id=? AND state IN('submitting','pending','scheduled','uncertain')",
      )
      .bind(input.workspaceId)
      .first()
  )
    invalid('payment_change_pending')
  const rule = await db
    .prepare(
      'SELECT * FROM platform_payment_plan_rules WHERE from_plan=? AND to_plan=? AND enabled=1',
    )
    .bind(sub.plan_id, input.planId)
    .first<any>()
  if (!rule) invalid('payment_change_not_allowed', 403)
  const target = await db
    .prepare(
      'SELECT d.*,p.revision FROM platform_dodo_products d JOIN platform_plans p ON p.id=d.plan_id WHERE d.provider_key=? AND d.plan_id=? AND d.interval=? AND d.plan_revision=p.revision AND d.credential_revision=? AND p.active=1 AND p.listed=1 AND d.effective_price>0 AND d.currency=?',
    )
    .bind(key, input.planId, sub.interval, revision, sub.currency)
    .first<any>()
  if (!target) invalid('payment_plan_unavailable')
  await validateTarget(client, target)
  const actual = await dodoRequest(() =>
    client.subscriptions.retrieve(rawDodoId(sub.id)),
  )
  if (
    actual.product_id !== sub.product_id ||
    actual.status !== 'active' ||
    actual.cancel_at_next_billing_date ||
    actual.scheduled_change ||
    actual.customer.customer_id !== sub.customer_id
  )
    invalid('payment_subscription_changed')
  const params = {
    product_id: target.product_id,
    quantity: 1,
    ...mode(rule.direction),
    on_payment_failure: 'prevent_change' as const,
    discount_codes: [],
  }
  const quote = await dodoRequest(() =>
    client.subscriptions.previewChangePlan(rawDodoId(sub.id), params),
  )
  if (
    quote.new_plan.product_id !== target.product_id ||
    quote.new_plan.quantity !== 1 ||
    !Number.isSafeInteger(quote.immediate_charge.summary.total_amount)
  )
    invalid('payment_quote_invalid', 502)
  const id = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO platform_payment_plan_changes(id,workspace_id,user_id,subscription_id,provider_key,credential_revision,from_product,from_plan,to_product,to_plan,interval,price,currency,direction,rule_revision,plan_revision,subscription_revision,quote_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'quoted',?,?)",
    )
    .bind(
      id,
      input.workspaceId,
      user,
      sub.id,
      key,
      revision,
      sub.product_id,
      sub.plan_id,
      target.product_id,
      target.plan_id,
      target.interval,
      target.effective_price,
      target.currency,
      rule.direction,
      rule.revision,
      target.revision,
      sub.revision,
      JSON.stringify(quote.immediate_charge),
      now,
      now,
    )
    .run()
  return {
    id,
    direction: rule.direction,
    planId: target.plan_id,
    interval: target.interval,
    renewalAmount: target.effective_price,
    currency: target.currency,
    charge: quote.immediate_charge.summary,
    effectiveAt: quote.immediate_charge.effective_at,
    expiresAt: now + 600000,
  }
}
export async function commitPaymentPlanChange(
  db: PlatformD1,
  secret: string,
  user: number,
  workspace: number,
  id: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  const { sub, client, key, revision } = await context(
    db,
    secret,
    user,
    workspace,
    transport,
  )
  const row = await db
    .prepare(
      'SELECT * FROM platform_payment_plan_changes WHERE id=? AND workspace_id=? AND user_id=? AND subscription_id=? AND provider_key=?',
    )
    .bind(id, workspace, user, sub.id, key)
    .first<any>()
  if (!row) invalid('payment_change_unavailable', 404)
  if (row.state === 'failed') invalid('payment_change_failed')
  if (row.state !== 'quoted') return { state: row.state }
  if (
    row.created_at < now - 600000 ||
    row.credential_revision !== revision ||
    row.subscription_revision !== sub.revision ||
    row.from_product !== sub.product_id
  )
    invalid('payment_quote_expired')
  const actual = await dodoRequest(() =>
    client.subscriptions.retrieve(rawDodoId(sub.id)),
  )
  if (
    actual.product_id !== sub.product_id ||
    actual.status !== 'active' ||
    actual.cancel_at_next_billing_date ||
    actual.scheduled_change ||
    actual.customer.customer_id !== sub.customer_id
  )
    invalid('payment_subscription_changed')
  const target = await db
    .prepare(
      'SELECT * FROM platform_dodo_products WHERE provider_key=? AND product_id=? AND plan_revision=? AND credential_revision=?',
    )
    .bind(key, row.to_product, row.plan_revision, revision)
    .first<any>()
  if (!target) invalid('payment_quote_expired')
  await validateTarget(client, target)
  const changed = await db
    .prepare(
      "UPDATE platform_payment_plan_changes SET state='submitting',updated_at=? WHERE id=? AND state='quoted' AND EXISTS(SELECT 1 FROM platform_payment_plan_rules WHERE from_plan=? AND to_plan=? AND enabled=1 AND revision=?) AND EXISTS(SELECT 1 FROM platform_dodo_products d JOIN platform_plans p ON p.id=d.plan_id WHERE d.provider_key=? AND d.plan_id=? AND d.interval=? AND d.product_id=? AND d.plan_revision=p.revision AND p.revision=? AND d.credential_revision=? AND p.active=1 AND p.listed=1) AND EXISTS(SELECT 1 FROM platform_payment_settings s JOIN platform_payment_providers p ON p.id=s.current_provider WHERE s.enabled=1 AND s.purchase_method='payment' AND p.id=? AND p.revision=?) AND EXISTS(SELECT 1 FROM platform_payment_subscriptions s JOIN platform_workspace_plans w ON w.payment_subscription_id=s.id AND w.source='payment' WHERE s.id=? AND s.revision=? AND s.product_id=?)",
    )
    .bind(
      now,
      id,
      row.from_plan,
      row.to_plan,
      row.rule_revision,
      key,
      row.to_plan,
      row.interval,
      row.to_product,
      row.plan_revision,
      revision,
      key,
      revision,
      sub.id,
      sub.revision,
      sub.product_id,
    )
    .run()
    .catch(() => invalid('payment_change_pending'))
  if (!changed.meta.changes) invalid('payment_quote_expired')
  try {
    await dodoRequest(() =>
      client.subscriptions.changePlan(
        rawDodoId(sub.id),
        {
          product_id: row.to_product,
          quantity: 1,
          ...mode(row.direction),
          on_payment_failure: 'prevent_change',
          discount_codes: [],
          metadata: { ...actual.metadata, chronoframe_change_id: id },
        },
        { headers: { 'Idempotency-Key': `cf-change-${id}` } },
      ),
    )
    const state = row.direction === 'downgrade' ? 'scheduled' : 'pending'
    await db
      .prepare(
        "UPDATE platform_payment_plan_changes SET state=?,updated_at=? WHERE id=? AND state='submitting'",
      )
      .bind(state, now, id)
      .run()
    await db
      .prepare(
        'UPDATE platform_payment_subscriptions SET next_check_at=0 WHERE id=?',
      )
      .bind(sub.id)
      .run()
    await checkPaymentPlanChange(
      db,
      secret,
      user,
      workspace,
      transport,
      now,
    ).catch(() => undefined)
    const latest = await db
      .prepare('SELECT state FROM platform_payment_plan_changes WHERE id=?')
      .bind(id)
      .first<any>()
    return { state: latest.state }
  } catch (error) {
    // An ambiguous response may already have charged the saved payment method. Never resend it.
    await db
      .prepare(
        "UPDATE platform_payment_plan_changes SET state=?,updated_at=? WHERE id=? AND state='submitting'",
      )
      .bind(
        error instanceof DodoProviderError &&
          [400, 401, 403, 404, 422].includes(error.providerStatus ?? 0)
          ? 'failed'
          : 'uncertain',
        now,
        id,
      )
      .run()
    throw error
  }
}

export async function checkPaymentPlanChange(
  db: PlatformD1,
  secret: string,
  user: number,
  workspace: number,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  await paymentMember(db, user, workspace, true)
  const settings = await paymentSettings(db)
  const row = await db
    .prepare(
      "SELECT s.* FROM platform_payment_subscriptions s JOIN platform_payment_plan_changes c ON c.subscription_id=s.id WHERE c.workspace_id=? AND c.provider_key=? AND c.state IN('submitting','pending','scheduled','uncertain') ORDER BY c.created_at DESC LIMIT 1",
    )
    .bind(workspace, settings.currentProvider)
    .first<any>()
  if (!row) return { state: 'idle' }
  const { reconcileDodoSubscription } = await import('./dodo-payments.ts')
  await reconcileDodoSubscription(
    db,
    secret,
    row.environment,
    rawDodoId(row.id),
    undefined,
    transport,
    now,
    row.provider_key,
  )
  return { checked: true }
}
