import { discountedPrice } from '../../contracts/src/pricing.ts'
import { paymentProductSnapshot } from './payment-product-sync.ts'
import type { PlatformD1 } from './index.ts'
import {
  allRows,
  SubscriptionError,
  subscriptionInvalidation,
  EXPIRY_PLAN_SQL,
} from './subscriptions.ts'
import { paymentMember, paymentSettings } from './payments.ts'
import {
  dodoClient,
  DodoProviderError,
  dodoRequest,
  dodoId,
  rawDodoId,
  dodoURL,
  type DodoEnvironment,
} from './dodo-client.ts'
import { sealPaymentEventPayload } from './payment-events.ts'
const fail = (code: string, status = 409): never => {
  throw new SubscriptionError(status, code)
}
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value)
const timestamp = (value: unknown) =>
  typeof value === 'string' ? Date.parse(value) : NaN
async function selectedEnvironment(db: PlatformD1): Promise<DodoEnvironment> {
  const settings = await paymentSettings(db)
  if (
    !settings.enabled ||
    !settings.providerAvailable ||
    !settings.configured ||
    !['test', 'live'].includes(settings.environment ?? '')
  )
    fail('payment_unavailable', 503)
  return settings.environment as DodoEnvironment
}
const activeFence =
  'EXISTS(SELECT 1 FROM platform_payment_settings s JOIN platform_payment_providers p ON p.id=s.current_provider WHERE s.id=1 AND s.enabled=1 AND p.id=? AND p.revision=?)'

/** Publish immutable price versions; existing subscriptions keep their purchased product. */
export async function syncDodoProducts(
  db: PlatformD1,
  secret: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
  limit = 2,
  force = false,
) {
  const settings = await paymentSettings(db)
  if (!settings.enabled || !settings.providerAvailable || !settings.configured)
    return { processed: 0 }
  const environment = settings.environment as DodoEnvironment,
    key = settings.currentProvider!
  const { client, revision } = await dodoClient(
    db,
    secret,
    environment,
    transport,
    false,
    key,
  )
  const syncToken = crypto.randomUUID()
  const syncLock = await db
    .prepare(
      'INSERT INTO platform_dodo_sync_locks(provider_key,token,expires_at) VALUES(?,?,?) ON CONFLICT(provider_key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<? RETURNING token',
    )
    .bind(key, syncToken, now + 240000, now)
    .first<any>()
  if (syncLock?.token !== syncToken) return { processed: 0, busy: true }
  try {
    const plans = await allRows<any>(
      db
        .prepare(
          'SELECT p.*,i.period,COALESCE(f.attempts,0) AS sync_attempts FROM platform_plans p CROSS JOIN (SELECT 1 AS period UNION ALL SELECT 3) i LEFT JOIN platform_dodo_products d ON d.provider_key=? AND d.plan_id=p.id AND d.interval=i.period LEFT JOIN platform_dodo_sync_failures f ON f.provider_key=? AND f.plan_id=p.id AND f.interval=i.period AND f.plan_revision=p.revision AND f.credential_revision=? WHERE (?=1 OR f.next_attempt_at IS NULL OR f.next_attempt_at<=?) AND p.active=1 AND p.listed=1 AND CASE WHEN i.period=1 THEN p.monthly_price ELSE p.quarterly_price END>0 AND (d.product_id IS NULL OR d.plan_revision<>p.revision OR d.credential_revision<>?) ORDER BY p.sort_order,p.id,i.period LIMIT ?',
        )
        .bind(key, key, revision, force ? 1 : 0, now, revision, limit),
    )
    let processed = 0,
      failed = 0
    for (const plan of plans) {
      try {
        const price = Number(
          plan.period === 1 ? plan.monthly_price : plan.quarterly_price,
        )
        const snapshot = paymentProductSnapshot(plan, plan.period)
        const discountBps = Number(
          plan.period === 1
            ? plan.monthly_discount_bps
            : plan.quarterly_discount_bps,
        )
        const effectivePrice = discountedPrice(price, discountBps)!
        if (effectivePrice < 1) fail('payment_price_invalid', 400)
        const body = {
          name: snapshot.product.name,
          description: snapshot.product.description.slice(0, 1000),
          tax_category: 'saas' as const,
          price: {
            type: 'recurring_price' as const,
            currency: plan.currency,
            price,
            payment_frequency_count: plan.period,
            payment_frequency_interval: 'Month' as const,
            subscription_period_count: 20,
            subscription_period_interval: 'Year' as const,
            tax_inclusive: true,
            trial_period_days: 0,
            // Older Dodo API deployments still require the integer-percent field. New APIs prefer discount_bps.
            discount: Math.floor(discountBps / 100),
            discount_bps: discountBps,
            purchasing_power_parity: false,
          },
          metadata: {
            chronoframe_plan_id: plan.id,
            chronoframe_interval: String(plan.period),
            chronoframe_profile_id: key,
            chronoframe_plan_revision: String(plan.revision),
          },
        }
        const product = await dodoRequest(() =>
          client.products.create(body, {
            idempotencyKey: `cf-product-${key}-${revision}-${plan.id}-${plan.revision}-${plan.period}`,
            headers: {
              'Idempotency-Key': `cf-product-${key}-${revision}-${plan.id}-${plan.revision}-${plan.period}`,
            },
          }),
        )
        if (!identifier(product.product_id))
          fail('payment_product_invalid', 502)
        const returnedPrice = product.price
        if (
          returnedPrice?.type !== 'recurring_price' ||
          returnedPrice.price !== price ||
          returnedPrice.currency !== plan.currency ||
          returnedPrice.payment_frequency_count !== plan.period ||
          returnedPrice.payment_frequency_interval !== 'Month'
        )
          fail('payment_product_mismatch', 502)
        if (
          (returnedPrice.discount_bps ??
            (returnedPrice.discount ?? 0) * 100) !== discountBps
        )
          fail('payment_discount_precision_unsupported', 422)
        const published = await db
          .prepare(
            `INSERT INTO platform_dodo_products(provider_key,plan_id,interval,product_id,price,currency,discount_bps,effective_price,plan_revision,credential_revision,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${activeFence} AND EXISTS(SELECT 1 FROM platform_dodo_sync_locks WHERE provider_key=? AND token=? AND expires_at>?) AND EXISTS(SELECT 1 FROM platform_plans WHERE id=? AND revision=?) ON CONFLICT(provider_key,plan_id,interval) DO UPDATE SET product_id=excluded.product_id,price=excluded.price,currency=excluded.currency,discount_bps=excluded.discount_bps,effective_price=excluded.effective_price,plan_revision=excluded.plan_revision,credential_revision=excluded.credential_revision,updated_at=excluded.updated_at`,
          )
          .bind(
            key,
            plan.id,
            plan.period,
            product.product_id,
            price,
            plan.currency,
            discountBps,
            effectivePrice,
            plan.revision,
            revision,
            now,
            key,
            revision,
            key,
            syncToken,
            Date.now(),
            plan.id,
            plan.revision,
          )
          .run()
        if (published.meta.changes) {
          await db
            .prepare(
              'DELETE FROM platform_dodo_sync_failures WHERE provider_key=? AND plan_id=? AND interval=?',
            )
            .bind(key, plan.id, plan.period)
            .run()
          processed++
        }
      } catch (error) {
        failed++
        const code =
          error instanceof DodoProviderError
            ? error.diagnostic()
            : error instanceof SubscriptionError &&
                [
                  'payment_price_invalid',
                  'payment_product_invalid',
                  'payment_product_mismatch',
                  'payment_discount_precision_unsupported',
                  'payment_provider_request_failed',
                  'payment_provider_redirect_blocked',
                  'payment_unavailable',
                ].includes(error.code)
              ? error.code
              : 'payment_product_sync_failed'
        const attempts = Number(plan.sync_attempts) + 1
        const nextAttempt =
          now + Math.min(3600000, 30000 * 2 ** Math.min(attempts - 1, 7))
        await db
          .prepare(
            `INSERT INTO platform_dodo_sync_failures(provider_key,plan_id,interval,plan_revision,credential_revision,attempts,next_attempt_at,error,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${activeFence} AND EXISTS(SELECT 1 FROM platform_dodo_sync_locks WHERE provider_key=? AND token=?) ON CONFLICT(provider_key,plan_id,interval) DO UPDATE SET plan_revision=excluded.plan_revision,credential_revision=excluded.credential_revision,attempts=excluded.attempts,next_attempt_at=excluded.next_attempt_at,error=excluded.error,updated_at=excluded.updated_at`,
          )
          .bind(
            key,
            plan.id,
            plan.period,
            plan.revision,
            revision,
            attempts,
            nextAttempt,
            code,
            now,
            key,
            revision,
            key,
            syncToken,
          )
          .run()
      }
    }
    return { processed, failed }
  } finally {
    await db
      .prepare(
        'DELETE FROM platform_dodo_sync_locks WHERE provider_key=? AND token=?',
      )
      .bind(key, syncToken)
      .run()
  }
}

export async function createDodoCheckout(
  db: PlatformD1,
  secret: string,
  userId: number,
  input: {
    workspaceId: number
    planId: string
    interval: number
    requestId: string
  },
  origin: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  const member = await paymentMember(db, userId, input.workspaceId, true)
  const environment = await selectedEnvironment(db),
    key = (await paymentSettings(db)).currentProvider!
  if ((await paymentSettings(db)).purchaseMethod !== 'payment')
    fail('payment_unavailable', 503)
  if (
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(input.planId) ||
    !identifier(input.requestId) ||
    ![1, 3].includes(input.interval)
  )
    fail('payment_checkout_invalid', 400)
  const { client, revision } = await dodoClient(
    db,
    secret,
    environment,
    transport,
    true,
    key,
  )
  const existing = await db
    .prepare(
      'SELECT * FROM platform_payment_checkouts WHERE user_id=? AND request_id=?',
    )
    .bind(userId, input.requestId)
    .first<any>()
  if (existing) {
    if (
      existing.workspace_id !== input.workspaceId ||
      existing.plan_id !== input.planId ||
      existing.interval !== input.interval ||
      existing.provider !== 'dodo' ||
      existing.provider_key !== key ||
      existing.environment !== environment
    )
      fail('payment_request_conflict')
    if (existing.state === 'open' && existing.checkout_url)
      return {
        id: existing.id,
        url: dodoURL(existing.checkout_url, environment),
      }
    fail('payment_confirmation_pending')
  }
  const product = await db
    .prepare(
      'SELECT d.* FROM platform_dodo_products d JOIN platform_plans p ON p.id=d.plan_id WHERE d.provider_key=? AND d.plan_id=? AND d.interval=? AND d.credential_revision=? AND d.plan_revision=p.revision AND p.active=1 AND p.listed=1 AND d.price=CASE WHEN d.interval=1 THEN p.monthly_price ELSE p.quarterly_price END AND d.currency=p.currency',
    )
    .bind(key, input.planId, input.interval, revision)
    .first<any>()
  if (!product) fail('payment_plan_unavailable', 400)
  const prior = await db
    .prepare(
      'SELECT revision FROM platform_workspace_plans WHERE workspace_id=?',
    )
    .bind(input.workspaceId)
    .first<any>()
  if (!prior) fail('workspace_unavailable', 404)
  // Rate limit includes failed attempts, and the partial unique index serializes new sessions per workspace.
  const budget = await db
    .prepare(
      'INSERT INTO platform_payment_requests(user_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
    )
    .bind(userId, Math.floor(now / 60000) * 60000)
    .first<any>()
  if (budget.attempts > 10) fail('payment_rate_limited', 429)
  if (
    await db
      .prepare(
        "SELECT id FROM platform_payment_subscriptions WHERE workspace_id=? AND provider='dodo' AND environment=? AND provider_key=? AND status NOT IN('canceled','expired','failed') LIMIT 1",
      )
      .bind(input.workspaceId, environment, key)
      .first()
  )
    fail('payment_subscription_exists')
  const providerProduct = await dodoRequest(() =>
    client.products.retrieve(product.product_id),
  )
  const price = providerProduct.price
  if (
    providerProduct.product_id !== product.product_id ||
    !providerProduct.is_recurring ||
    price.type !== 'recurring_price' ||
    price.price !== product.price ||
    price.currency !== product.currency ||
    price.payment_frequency_interval !== 'Month' ||
    price.payment_frequency_count !== input.interval ||
    !price.tax_inclusive ||
    (price.trial_period_days ?? 0) !== 0 ||
    (price.discount_bps ?? (price.discount ?? 0) * 100) !==
      product.discount_bps ||
    price.purchasing_power_parity ||
    providerProduct.addons?.length
  )
    fail('payment_product_mismatch', 422)
  const id = crypto.randomUUID()
  try {
    const result = await db
      .prepare(
        `INSERT INTO platform_payment_checkouts(id,workspace_id,user_id,request_id,plan_id,interval,product_id,price,currency,assignment_revision,state,created_at,updated_at,provider,environment,provider_key) SELECT ?,?,?,?,?,?,?,?,?,?,'creating',?,?,'dodo',?,? WHERE ${activeFence}`,
      )
      .bind(
        id,
        input.workspaceId,
        userId,
        input.requestId,
        input.planId,
        input.interval,
        product.product_id,
        product.effective_price,
        product.currency,
        prior.revision,
        now,
        now,
        environment,
        key,
        key,
        revision,
      )
      .run()
    if (!result.meta.changes) fail('payment_unavailable', 503)
  } catch (error) {
    if (error instanceof SubscriptionError) throw error
    fail('payment_busy')
  }
  try {
    const session = await dodoRequest(() =>
      client.checkoutSessions.create(
        {
          product_cart: [{ product_id: product.product_id, quantity: 1 }],
          billing_currency: product.currency,
          customer: { email: member.email },
          metadata: {
            chronoframe_checkout_id: id,
            chronoframe_environment: environment,
            chronoframe_profile_id: key,
          },
          return_url: new URL(
            `/account/plan?checkout=${encodeURIComponent(id)}`,
            origin,
          ).href,
          feature_flags: {
            allow_currency_selection: false,
            allow_discount_code: false,
            allow_customer_editing_email: false,
            allow_editing_addons: false,
          },
        },
        {
          idempotencyKey: `cf-checkout-${environment}-${id}`,
          headers: { 'Idempotency-Key': `cf-checkout-${environment}-${id}` },
        },
      ),
    )
    if (!identifier(session.session_id)) fail('payment_checkout_invalid', 502)
    const url = dodoURL(session.checkout_url, environment)
    await db
      .prepare(
        "UPDATE platform_payment_checkouts SET provider_id=?,checkout_url=?,state='open',updated_at=? WHERE id=? AND state='creating'",
      )
      .bind(dodoId(key, session.session_id), url, now, id)
      .run()
    await dodoClient(db, secret, environment, transport, true, key)
    return { id, url }
  } catch {
    await db
      .prepare(
        "UPDATE platform_payment_checkouts SET state='uncertain',error='payment_confirmation_pending',updated_at=? WHERE id=? AND state='creating'",
      )
      .bind(now, id)
      .run()
    fail('payment_confirmation_pending', 502)
  }
}

/** Verify with the official SDK, then durably accept before any provider reads. */
export async function receiveDodoEvent(
  db: PlatformD1,
  secret: string,
  environment: DodoEnvironment,
  body: Uint8Array,
  headers: Record<string, string>,
  transport: typeof fetch = fetch,
  now = Date.now(),
  expectedProfile?: string,
) {
  const { client, revision, key } = await dodoClient(
    db,
    secret,
    environment,
    transport,
    false,
    expectedProfile,
  )
  if (body.byteLength > 65536) fail('payment_payload_too_large', 413)
  let event: any
  try {
    event = client.webhooks.unwrap(
      new TextDecoder('utf-8', { fatal: true }).decode(body),
      { headers },
    )
  } catch {
    fail('payment_signature_invalid', 401)
  }
  const rawId = headers['webhook-id']
  if (!identifier(rawId) || typeof event?.type !== 'string' || !event.data)
    fail('payment_event_invalid', 400)
  const supported =
    event.type.startsWith('subscription.') ||
    event.type.startsWith('payment.') ||
    event.type.startsWith('refund.') ||
    event.type.startsWith('dispute.')
  const objectId = event.type.startsWith('subscription.')
    ? event.data.subscription_id
    : event.data.payment_id
  if (!supported || !identifier(objectId)) return { received: true }
  const id = dodoId(key, rawId!),
    cipher = await sealPaymentEventPayload(secret, id, body)
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO platform_payment_events(id,type,object_id,reference_id,created_at,available_at,provider,environment,provider_key) SELECT ?,?,?,(SELECT id FROM platform_payment_checkouts WHERE id=? AND provider='dodo' AND environment=? AND provider_key=?),?,?,'dodo',?,? WHERE ${activeFence}`,
      )
      .bind(
        id,
        event.type,
        dodoId(key, objectId),
        String(event.data.metadata?.chronoframe_checkout_id ?? ''),
        environment,
        key,
        now,
        now,
        environment,
        key,
        key,
        revision,
      ),
    db
      .prepare(
        'INSERT OR IGNORE INTO platform_payment_event_payloads(event_id,ciphertext,received_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM platform_payment_events WHERE id=?)',
      )
      .bind(id, cipher, now, id),
  ])
  if (
    !(await db
      .prepare('SELECT id FROM platform_payment_events WHERE id=?')
      .bind(id)
      .first())
  )
    fail('payment_unavailable', 503)
  return { received: true }
}

/** Read authoritative payment and subscription state; browser and webhook bodies never grant access. */
async function reconcileDodoSubscription(
  db: PlatformD1,
  secret: string,
  environment: DodoEnvironment,
  subscriptionId: string,
  paymentId: string | undefined,
  transport: typeof fetch,
  now: number,
  key: string,
) {
  if (!identifier(subscriptionId)) fail('payment_subscription_invalid', 422)
  const { client, revision } = await dodoClient(
    db,
    secret,
    environment,
    transport,
    false,
    key,
  )
  let subscription = await dodoRequest(() =>
    client.subscriptions.retrieve(subscriptionId),
  )
  const checkoutId = subscription.metadata?.chronoframe_checkout_id
  if (
    !identifier(checkoutId) ||
    subscription.metadata?.chronoframe_environment !== environment ||
    subscription.metadata?.chronoframe_profile_id !== key
  )
    return
  const checkout = await db
    .prepare(
      "SELECT * FROM platform_payment_checkouts WHERE id=? AND provider='dodo' AND environment=? AND provider_key=?",
    )
    .bind(checkoutId, environment, key)
    .first<any>()
  if (!checkout) return
  const token = crypto.randomUUID()
  const lock = await db
    .prepare(
      'INSERT INTO platform_payment_locks(workspace_id,token,expires_at) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<? RETURNING token',
    )
    .bind(checkout.workspace_id, token, now + 60000, now)
    .first<any>()
  if (lock?.token !== token) fail('payment_busy')
  const checkoutState = async (
    state: 'uncertain' | 'expired',
    error: string,
  ) => {
    await db
      .prepare(
        `UPDATE platform_payment_checkouts SET state=?,error=?,updated_at=? WHERE id=? AND state IN('creating','open','uncertain') AND ${activeFence} AND EXISTS(SELECT 1 FROM platform_payment_locks WHERE workspace_id=? AND token=?)`,
      )
      .bind(
        state,
        error,
        now,
        checkout.id,
        key,
        revision,
        checkout.workspace_id,
        token,
      )
      .run()
  }
  try {
    subscription = await dodoRequest(() =>
      client.subscriptions.retrieve(subscriptionId),
    )
    if (
      subscription.metadata?.chronoframe_checkout_id !== checkout.id ||
      subscription.metadata?.chronoframe_environment !== environment ||
      subscription.metadata?.chronoframe_profile_id !== key
    )
      fail('payment_subscription_mismatch', 422)
    if (
      subscription.subscription_id !== subscriptionId ||
      subscription.product_id !== checkout.product_id ||
      subscription.quantity !== 1 ||
      subscription.payment_frequency_interval !== 'Month' ||
      subscription.payment_frequency_count !== checkout.interval ||
      subscription.on_demand ||
      subscription.trial_period_days !== 0
    )
      fail('payment_subscription_mismatch', 422)
    // An initial grant must also be bound to the payment returned by our stored checkout session.
    const localId = dodoId(key, subscriptionId)
    const known = await db
      .prepare('SELECT * FROM platform_payment_subscriptions WHERE id=?')
      .bind(localId)
      .first<any>()
    if (!known && checkout.provider_id) {
      const session = await dodoRequest(() =>
        client.checkoutSessions.retrieve(rawDodoId(checkout.provider_id)),
      )
      if (session.id !== rawDodoId(checkout.provider_id))
        fail('payment_checkout_mismatch', 422)
      // The retrieved payment is authoritative; a session status may lag behind it.
      if (!session.payment_id) fail('payment_confirmation_pending')
      paymentId = session.payment_id ?? undefined
    } else if (!known && !paymentId) {
      const payments = await dodoRequest(() =>
        client.payments.list({
          subscription_id: subscriptionId,
          status: 'succeeded',
          page_size: 10,
        }),
      )
      paymentId = payments.items.find(
        (p) => p.metadata?.chronoframe_checkout_id === checkout.id,
      )?.payment_id
    }
    const payment = paymentId
      ? await dodoRequest(() => client.payments.retrieve(paymentId!))
      : null
    // A succeeded payment is never resumable, even when fulfillment needs investigation.
    if (payment?.status === 'succeeded' && !known)
      await checkoutState('uncertain', 'payment_confirmation_pending')
    const identityError = !payment
      ? null
      : payment.payment_id !== paymentId ||
          (payment.checkout_session_id &&
            !known &&
            checkout.provider_id &&
            payment.checkout_session_id !== rawDodoId(checkout.provider_id))
        ? 'payment_checkout_mismatch'
        : payment.is_update_payment_method ||
            payment.is_multi_subscription ||
            !(
              payment.subscription_id === subscriptionId ||
              payment.subscription_ids?.includes(subscriptionId)
            )
          ? 'payment_subscription_mismatch'
          : payment.customer.customer_id !== subscription.customer.customer_id
            ? 'payment_customer_mismatch'
            : payment.currency !== subscription.currency &&
                subscription.currency !== checkout.currency
              ? 'payment_currency_mismatch'
              : (payment.metadata?.chronoframe_checkout_id &&
                    payment.metadata.chronoframe_checkout_id !== checkout.id) ||
                  (payment.metadata?.chronoframe_environment &&
                    payment.metadata.chronoframe_environment !== environment) ||
                  (payment.metadata?.chronoframe_profile_id &&
                    payment.metadata.chronoframe_profile_id !== key) ||
                  (!known &&
                    !checkout.provider_id &&
                    payment.metadata?.chronoframe_checkout_id !== checkout.id)
                ? 'payment_checkout_mismatch'
                : null
    if (!known && identityError) fail(identityError, 422)
    // Cancellation must converge even if an initial grant failed its amount/period checks.
    // Only the authenticated, checkout-bound payment and subscription can release the slot.
    if (
      !known &&
      payment &&
      !identityError &&
      ['cancelled', 'expired', 'failed'].includes(subscription.status)
    ) {
      await checkoutState('expired', 'payment_subscription_inactive')
      return checkout.id as string
    }
    // Adaptive pricing charges the customer in a local currency. Compare the
    // provider's settlement amount in the immutable product currency, never a
    // browser amount, guessed exchange rate, or a numeric total in another currency.
    const amountMatches =
      payment &&
      Number.isSafeInteger(payment.total_amount) &&
      payment.total_amount > 0 &&
      (payment.currency === checkout.currency
        ? payment.total_amount === checkout.price
        : payment.settlement_currency === checkout.currency &&
          payment.settlement_amount === checkout.price)
    const successful =
      payment?.status === 'succeeded' &&
      !identityError &&
      amountMatches &&
      !payment.refunds?.length &&
      !payment.disputes?.length
    if (!known && payment?.status === 'succeeded' && !successful) {
      if (payment.refunds?.length || payment.disputes?.length)
        fail('payment_refunded_or_disputed', 422)
      fail('payment_amount_mismatch', 422)
    }
    const period = successful
      ? payment.service_periods?.find(
          (p) => p.subscription_id === subscriptionId,
        )
      : null
    if (!successful && !known) fail('payment_confirmation_pending')
    // Older Dodo responses can omit service_periods for the initial payment.
    // Only recover the first, checkout-bound period: subscription dates alone
    // must never extend an existing grant or turn a usage-only renewal into access.
    const initialStart = timestamp(subscription.previous_billing_date)
    const initialEnd = timestamp(subscription.next_billing_date)
    const initialPaymentTime = timestamp(payment?.created_at)
    const initialPeriod =
      successful &&
      !known &&
      !period &&
      !payment?.service_periods?.length &&
      (!payment?.charge_type || payment.charge_type === 'new') &&
      subscription.status === 'active' &&
      Math.abs(initialStart - initialPaymentTime) <= 300000 &&
      initialEnd > now &&
      initialEnd - initialStart <= (checkout.interval * 31 + 1) * 86400000
    let start = period
      ? timestamp(period.starts_at)
      : initialPeriod
        ? initialStart
        : known?.period_start
    let end = period
      ? timestamp(period.ends_at)
      : initialPeriod
        ? initialEnd
        : known?.period_end
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      end > now + 110 * 86400000 ||
      start > now + 60000
    ) {
      if (!known) fail('payment_period_invalid', 422)
      start = known.period_start
      end = known.period_end
    }
    if (known && end < known.period_end) {
      start = known.period_start
      end = known.period_end
    }
    const status =
      subscription.status === 'cancelled'
        ? 'canceled'
        : subscription.cancel_at_next_billing_date &&
            subscription.status === 'active'
          ? 'scheduled_cancel'
          : subscription.status === 'on_hold' ||
              subscription.status === 'paused'
            ? 'past_due'
            : subscription.status
    const active =
      ['active', 'scheduled_cancel', 'past_due'].includes(status) &&
      end > now &&
      !(payment && (payment.refunds?.length || payment.disputes?.length))
    // A failed/refunded payment may revoke but may never extend a paid-through boundary.
    if (!successful && known) end = known.period_end
    const prior = await db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=?')
      .bind(checkout.workspace_id)
      .first<any>()
    if (
      await db
        .prepare(
          'SELECT 1 FROM platform_account_deletions WHERE user_id=(SELECT owner_user_id FROM platform_workspaces WHERE id=?)',
        )
        .bind(checkout.workspace_id)
        .first()
    )
      fail('payment_account_unavailable')
    const canAssign = known
      ? prior?.payment_subscription_id === localId &&
        ['payment', 'expired_default'].includes(prior.source)
      : prior?.revision === checkout.assignment_revision ||
        (prior?.source === 'expired_default' &&
          prior.revision === checkout.assignment_revision + 1)
    const anchor = known?.quota_anchor ?? start
    const eventId = crypto.randomUUID()
    const fence = `${activeFence} AND EXISTS(SELECT 1 FROM platform_payment_locks WHERE workspace_id=? AND token=?)`
    const bindFence = [key, revision, checkout.workspace_id, token]
    const writes = [
      db
        .prepare(
          `INSERT INTO platform_payment_subscriptions(id,workspace_id,checkout_id,customer_id,product_id,plan_id,interval,quota_anchor,status,period_start,period_end,provider_updated_at,checked_at,next_check_at,error,provider,environment,provider_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'dodo',?,? WHERE ${fence} ON CONFLICT(id) DO UPDATE SET status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,error=excluded.error,revision=platform_payment_subscriptions.revision+1`,
        )
        .bind(
          localId,
          checkout.workspace_id,
          checkout.id,
          subscription.customer.customer_id,
          checkout.product_id,
          checkout.plan_id,
          checkout.interval,
          anchor,
          status,
          start,
          end,
          now,
          now,
          now + 300000,
          canAssign ? null : 'payment_grant_superseded',
          environment,
          key,
          ...bindFence,
        ),
      db
        .prepare(
          `UPDATE platform_payment_checkouts SET state='completed',error=NULL,updated_at=? WHERE id=? AND ${fence}`,
        )
        .bind(now, checkout.id, ...bindFence),
    ]
    if (
      canAssign &&
      (prior.source !== (active ? 'payment' : 'expired_default') ||
        prior.expires_at !== (active ? end : null) ||
        (active && prior.plan_id !== checkout.plan_id))
    ) {
      writes.push(
        db
          .prepare(
            `INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) SELECT ?,?,'payment',?,?,? WHERE ${fence}`,
          )
          .bind(
            eventId,
            checkout.workspace_id,
            JSON.stringify({ planId: prior.plan_id, source: prior.source }),
            JSON.stringify({
              provider: 'dodo',
              environment,
              subscriptionId: localId,
              planId: checkout.plan_id,
              periodEnd: end,
            }),
            now,
            ...bindFence,
          ),
      )
      writes.push(
        db
          .prepare(
            `UPDATE platform_workspace_plans SET plan_id=${active ? '?' : EXPIRY_PLAN_SQL},source=?,starts_at=?,expires_at=?,billing_interval=?,payment_subscription_id=?,revision=revision+1 WHERE workspace_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_subscription_events WHERE id=?)`,
          )
          .bind(
            ...(active ? [checkout.plan_id] : []),
            active ? 'payment' : 'expired_default',
            anchor,
            active ? end : null,
            active ? checkout.interval : null,
            localId,
            checkout.workspace_id,
            prior.revision,
            eventId,
          ),
      )
      writes.push(
        ...subscriptionInvalidation(db, checkout.workspace_id, eventId),
      )
    }
    await db.batch(writes)
    return checkout.id as string
  } catch (error) {
    if (error instanceof SubscriptionError && error.statusCode === 422)
      await checkoutState('uncertain', error.code)
    throw error
  } finally {
    await db
      .prepare(
        'DELETE FROM platform_payment_locks WHERE workspace_id=? AND token=?',
      )
      .bind(checkout.workspace_id, token)
      .run()
  }
}

export async function processDodoEvents(
  db: PlatformD1,
  secret: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
  limit = 5,
) {
  const settings = await paymentSettings(db)
  if (!settings.enabled || !settings.providerAvailable || !settings.configured)
    return
  const environment = settings.environment as DodoEnvironment,
    key = settings.currentProvider!
  await db
    .prepare(
      "UPDATE platform_payment_events SET state='failed',error='payment_attempts_exhausted',lease_token=NULL,lease_until=NULL WHERE provider='dodo' AND environment=? AND provider_key=? AND state='pending' AND attempts>=8 AND (lease_until IS NULL OR lease_until<?)",
    )
    .bind(environment, key, now)
    .run()
  const events = await allRows<any>(
    db
      .prepare(
        "SELECT * FROM platform_payment_events WHERE provider='dodo' AND environment=? AND provider_key=? AND state='pending' AND attempts<8 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT ?",
      )
      .bind(environment, key, now, now, limit),
  )
  for (const event of events) {
    const token = crypto.randomUUID()
    const lease = await db
      .prepare(
        "UPDATE platform_payment_events SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND state='pending' AND (lease_until IS NULL OR lease_until<?) RETURNING id",
      )
      .bind(token, now + 60000, event.id, now)
      .first()
    if (!lease) continue
    try {
      let reference: string | undefined
      if (event.type.startsWith('subscription.'))
        reference = await reconcileDodoSubscription(
          db,
          secret,
          environment,
          rawDodoId(event.object_id),
          undefined,
          transport,
          now,
          key,
        )
      else {
        const { client } = await dodoClient(
          db,
          secret,
          environment,
          transport,
          false,
          key,
        )
        const payment = await dodoRequest(() =>
          client.payments.retrieve(rawDodoId(event.object_id)),
        )
        if (payment.subscription_id && !payment.is_multi_subscription)
          reference = await reconcileDodoSubscription(
            db,
            secret,
            environment,
            payment.subscription_id,
            rawDodoId(event.object_id),
            transport,
            now,
            key,
          )
      }
      await db
        .prepare(
          "UPDATE platform_payment_events SET state='done',reference_id=COALESCE(?,reference_id),error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        )
        .bind(reference ?? null, event.id, token)
        .run()
    } catch {
      await db
        .prepare(
          "UPDATE platform_payment_events SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,error='payment_reconciliation_failed',available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        )
        .bind(
          now + Math.min(3600000, 30000 * 2 ** event.attempts),
          event.id,
          token,
        )
        .run()
    }
  }
}

export async function refreshDodoCheckout(
  db: PlatformD1,
  secret: string,
  userId: number,
  workspaceId: number,
  checkoutId: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  await paymentMember(db, userId, workspaceId, true)
  const budget = await db
    .prepare(
      'INSERT INTO platform_payment_requests(user_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
    )
    .bind(userId, Math.floor(now / 60000) * 60000)
    .first<any>()
  if (budget.attempts > 20) fail('payment_rate_limited', 429)
  const environment = await selectedEnvironment(db),
    key = (await paymentSettings(db)).currentProvider!
  if (!identifier(checkoutId)) fail('payment_checkout_invalid', 400)
  const row = await db
    .prepare(
      "SELECT * FROM platform_payment_checkouts WHERE id=? AND workspace_id=? AND user_id=? AND provider='dodo' AND environment=? AND provider_key=?",
    )
    .bind(checkoutId, workspaceId, userId, environment, key)
    .first<any>()
  if (!row) fail('payment_checkout_unavailable', 404)
  if (!row.provider_id) return { state: row.state }
  const { client, revision } = await dodoClient(
    db,
    secret,
    environment,
    transport,
    false,
    key,
  )
  const session = await dodoRequest(() =>
    client.checkoutSessions.retrieve(rawDodoId(row.provider_id)),
  )
  if (session.id !== rawDodoId(row.provider_id))
    fail('payment_checkout_mismatch', 422)
  if (session.payment_id) {
    const payment = await dodoRequest(() =>
      client.payments.retrieve(session.payment_id!),
    )
    if (
      payment.payment_id !== session.payment_id ||
      (payment.checkout_session_id &&
        payment.checkout_session_id !== session.id)
    )
      fail('payment_checkout_mismatch', 422)
    if (
      !payment.subscription_id &&
      !payment.subscription_ids?.length &&
      ['failed', 'cancelled'].includes(payment.status ?? '')
    ) {
      await db
        .prepare(
          `UPDATE platform_payment_checkouts SET state='expired',error='payment_not_completed',updated_at=? WHERE id=? AND state IN('creating','open','uncertain') AND ${activeFence}`,
        )
        .bind(now, row.id, key, revision)
        .run()
    }
    if (payment.subscription_id && !payment.is_multi_subscription)
      await reconcileDodoSubscription(
        db,
        secret,
        environment,
        payment.subscription_id,
        session.payment_id,
        transport,
        now,
        key,
      )
  } else if (now - row.created_at > 86400000)
    await db
      .prepare(
        "UPDATE platform_payment_checkouts SET state='expired',updated_at=? WHERE id=? AND state='open'",
      )
      .bind(now, row.id)
      .run()
  await db
    .prepare(
      "UPDATE platform_payment_checkouts SET updated_at=? WHERE id=? AND state='open'",
    )
    .bind(now, row.id)
    .run()
  const latest = await db
    .prepare(
      'SELECT c.state,c.error,s.status FROM platform_payment_checkouts c LEFT JOIN platform_payment_subscriptions s ON s.checkout_id=c.id WHERE c.id=?',
    )
    .bind(row.id)
    .first<any>()
  return {
    state:
      latest.error === 'payment_subscription_inactive' ||
      ['canceled', 'expired', 'failed'].includes(latest.status)
        ? 'inactive'
        : latest.state,
  }
}
export async function reconcileDodoPayments(
  db: PlatformD1,
  secret: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
) {
  const settings = await paymentSettings(db)
  if (!settings.enabled || !settings.providerAvailable || !settings.configured)
    return
  const environment = settings.environment as DodoEnvironment,
    key = settings.currentProvider!
  const due = await allRows<any>(
    db
      .prepare(
        "SELECT id FROM platform_payment_subscriptions WHERE provider='dodo' AND environment=? AND provider_key=? AND next_check_at<=? AND status NOT IN('canceled','expired','failed') ORDER BY next_check_at LIMIT 3",
      )
      .bind(environment, key, now),
  )
  for (const row of due) {
    try {
      const { client } = await dodoClient(
        db,
        secret,
        environment,
        transport,
        false,
        key,
      )
      const payments = await dodoRequest(() =>
        client.payments.list({
          subscription_id: rawDodoId(row.id),
          status: 'succeeded',
          page_size: 10,
        }),
      )
      const latest = [...payments.items].sort(
        (a, b) => timestamp(b.created_at) - timestamp(a.created_at),
      )[0]
      await reconcileDodoSubscription(
        db,
        secret,
        environment,
        rawDodoId(row.id),
        latest?.payment_id,
        transport,
        now,
        key,
      )
    } catch {
      await db
        .prepare(
          "UPDATE platform_payment_subscriptions SET error='payment_reconciliation_failed',next_check_at=? WHERE id=?",
        )
        .bind(now + 300000, row.id)
        .run()
    }
  }
  // The session's 24-hour validity has elapsed. Keep the immutable row for late provider events.
  await db
    .prepare(
      "UPDATE platform_payment_checkouts SET state='expired',error='payment_confirmation_unresolved',updated_at=? WHERE provider='dodo' AND environment=? AND provider_key=? AND state IN('creating','uncertain') AND provider_id IS NULL AND updated_at<?",
    )
    .bind(now, environment, key, now - 86400000)
    .run()
  const pending = await allRows<any>(
    db
      .prepare(
        "SELECT id,workspace_id,user_id FROM platform_payment_checkouts WHERE provider='dodo' AND environment=? AND provider_key=? AND state IN('open','uncertain') AND provider_id IS NOT NULL AND user_id IS NOT NULL ORDER BY updated_at LIMIT 2",
      )
      .bind(environment, key),
  )
  for (const row of pending)
    await refreshDodoCheckout(
      db,
      secret,
      row.user_id,
      row.workspace_id,
      row.id,
      transport,
      now,
    ).catch(async () => {
      await db
        .prepare(
          "UPDATE platform_payment_checkouts SET updated_at=?,error=COALESCE(error,'payment_reconciliation_failed') WHERE id=? AND state IN('open','uncertain')",
        )
        .bind(now, row.id)
        .run()
    })
  await processDodoEvents(db, secret, transport, now)
}

/** Real Dodo subscriptions must be canceled before deleting their local billing ledger. */
export async function closeDodoAccountPayments(
  db: PlatformD1,
  secret: string,
  userId: number,
  transport: typeof fetch = fetch,
) {
  const rows = await allRows<any>(
    db
      .prepare(
        "SELECT s.* FROM platform_payment_subscriptions s JOIN platform_workspaces w ON w.id=s.workspace_id JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE s.provider='dodo' AND (w.owner_user_id=? OR c.user_id=?) AND s.status NOT IN('canceled','expired','failed')",
      )
      .bind(userId, userId),
  )
  for (const row of rows) {
    // The normal payment switch also gates account-cleanup provider calls; erasure retries after re-enabling.
    const { client } = await dodoClient(
      db,
      secret,
      row.environment,
      transport,
      false,
      row.provider_key,
    )
    const result = await dodoRequest(() =>
      client.subscriptions.update(rawDodoId(row.id), { status: 'cancelled' }),
    )
    if (result.status !== 'cancelled') return false
    await db
      .prepare(
        "UPDATE platform_payment_subscriptions SET status='canceled',checked_at=? WHERE id=?",
      )
      .bind(Date.now(), row.id)
      .run()
  }
  return !(await db
    .prepare(
      "SELECT c.id FROM platform_payment_checkouts c JOIN platform_workspaces w ON w.id=c.workspace_id WHERE c.provider='dodo' AND (w.owner_user_id=? OR c.user_id=?) AND (c.state IN('creating','open','uncertain') OR (c.state='expired' AND c.error='payment_confirmation_unresolved')) LIMIT 1",
    )
    .bind(userId, userId)
    .first())
}
