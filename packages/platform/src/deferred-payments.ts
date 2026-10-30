import { closeFailedInitialCheckout } from './unpaid-checkout.ts'
import type { PlatformD1 } from './index.ts'
import { DAY } from './payment-handover.ts'
import { SubscriptionError, subscriptionInvalidation } from './subscriptions.ts'
import { dodoRequest } from './dodo-client.ts'
const fail = (code: string): never => {
  throw new SubscriptionError(422, code)
}
const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : NaN)
/** Called only under the workspace payment lock and the active credential fence. */
export async function reconcileDeferredAuthorization(
  db: PlatformD1,
  client: any,
  checkout: any,
  subscription: any,
  known: any,
  paymentId: string | undefined,
  now: number,
  fence: string,
  fenceValues: (string | number | null)[],
  localId: string,
) {
  if (!checkout.handover_json || known?.activation_state === 'paid')
    return { handled: false, paymentId }
  if (known && known.customer_id !== subscription.customer.customer_id)
    fail('payment_customer_mismatch')
  const snapshot = JSON.parse(checkout.handover_json)
  // The caller has verified provider metadata and product ownership. Do not leave
  // a new, rejected trial running without a local reservation to manage it.
  async function rejectNewAuthorization(code: string): Promise<never> {
    if (!known && subscription.status === 'active') {
      await dodoRequest(() =>
        client.subscriptions.update(
          subscription.subscription_id,
          { status: 'cancelled' },
          {
            headers: { 'Idempotency-Key': `cf-cancel-handover-${checkout.id}` },
          },
        ),
      )
      const actual = (await dodoRequest(() =>
        client.subscriptions.retrieve(subscription.subscription_id),
      )) as any
      if (actual.status !== 'cancelled') fail('payment_confirmation_pending')
      if (!checkout.provider_id)
        await db
          .prepare(
            `UPDATE platform_payment_checkouts SET state='expired',error=?,updated_at=? WHERE id=? AND state IN('creating','open','uncertain') AND ${fence}`,
          )
          .bind(code, now, checkout.id, ...fenceValues)
          .run()
    }
    return fail(code)
  }
  if (subscription.trial_period_days !== snapshot.trialDays)
    fail('payment_subscription_mismatch')
  if (!known) {
    if (!checkout.provider_id)
      await rejectNewAuthorization('payment_checkout_mismatch')
    const session = (await dodoRequest(() =>
      client.checkoutSessions.retrieve(checkout.provider_id.split(':').pop()),
    )) as any
    if (
      session.id !== checkout.provider_id.split(':').pop() ||
      (session.customer_email &&
        session.customer_email.toLowerCase() !== snapshot.email.toLowerCase())
    )
      await rejectNewAuthorization('payment_checkout_mismatch')
    paymentId ??= session.payment_id ?? undefined
  }
  let payment = paymentId
    ? ((await dodoRequest(() => client.payments.retrieve(paymentId))) as any)
    : null
  if (
    !payment ||
    (known &&
      now >= known.handover_at &&
      !(payment.status === 'succeeded' && payment.total_amount > 0))
  ) {
    const results = (await dodoRequest(() =>
      client.payments.list({
        subscription_id: subscription.subscription_id,
        status: 'succeeded',
        page_size: 10,
      }),
    )) as any
    const latest = results.items
      .filter(
        (p: any) =>
          p.status === 'succeeded' &&
          p.total_amount > 0 &&
          (p.subscription_id === subscription.subscription_id ||
            p.subscription_ids?.includes(subscription.subscription_id)),
      )
      .sort((a: any, b: any) => time(b.created_at) - time(a.created_at))[0]
    if (latest) {
      paymentId = latest.payment_id
      payment = await dodoRequest(() => client.payments.retrieve(paymentId))
    }
  }
  if (payment?.status === 'succeeded' && payment.total_amount > 0) {
    if (
      known?.status === 'canceled' ||
      checkout.error === 'payment_handover_cancelled'
    )
      fail('payment_handover_cancelled')
    const period = payment.service_periods?.find(
      (p: any) => p.subscription_id === subscription.subscription_id,
    )
    if (
      !period ||
      time(period.starts_at) <
        (known?.handover_at ?? snapshot.expiresAt) - 60000
    )
      fail('payment_period_invalid')
    return { handled: false, paymentId }
  }
  if (
    payment &&
    (payment.payment_id !== paymentId ||
      payment.customer?.customer_id !== subscription.customer.customer_id ||
      !(
        payment.subscription_id === subscription.subscription_id ||
        payment.subscription_ids?.includes(subscription.subscription_id)
      ) ||
      payment.is_update_payment_method ||
      payment.is_multi_subscription ||
      payment.refunds?.length ||
      payment.disputes?.length)
  )
    fail('payment_subscription_mismatch')
  if (
    await closeFailedInitialCheckout(
      db,
      client,
      checkout,
      subscription,
      payment,
      known,
      now,
      fence,
      fenceValues,
    )
  )
    return { handled: true, paymentId }
  const at = known?.handover_at ?? time(subscription.next_billing_date)
  if (
    !Number.isSafeInteger(at) ||
    at < snapshot.expiresAt ||
    (!known &&
      (at > checkout.created_at + (snapshot.trialDays + 1) * DAY ||
        time(subscription.previous_billing_date) > checkout.created_at + DAY))
  )
    await rejectNewAuthorization('payment_handover_date_invalid')
  const prior = await db
    .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=?')
    .bind(checkout.workspace_id)
    .first<any>()
  if (!prior) fail('workspace_unavailable')
  const accountDeleted = !!(await db
    .prepare(
      'SELECT 1 FROM platform_account_deletions WHERE user_id=(SELECT owner_user_id FROM platform_workspaces WHERE id=?)',
    )
    .bind(checkout.workspace_id)
    .first())
  fence +=
    ' AND EXISTS(SELECT 1 FROM platform_workspace_plans WHERE workspace_id=? AND revision=?)'
  fenceValues = [...fenceValues, checkout.workspace_id, prior.revision]
  const expectedRevision = known?.handover_revision ?? snapshot.revision
  const bound =
    prior &&
    ((prior.revision === expectedRevision &&
      prior.plan_id === snapshot.planId &&
      prior.source === snapshot.source) ||
      (prior.source === 'expired_default' &&
        prior.revision === expectedRevision + 1))
  let terminal =
    ['cancelled', 'expired', 'failed'].includes(subscription.status) ||
    checkout.error === 'payment_handover_cancelled'
  if (
    (!bound ||
      accountDeleted ||
      subscription.cancel_at_next_billing_date ||
      terminal) &&
    subscription.status === 'active' &&
    at > Math.max(now, Date.now()) + 60000
  ) {
    await dodoRequest(() =>
      client.subscriptions.update(
        subscription.subscription_id,
        { status: 'cancelled' },
        { headers: { 'Idempotency-Key': `cf-cancel-handover-${checkout.id}` } },
      ),
    )
    const actual = (await dodoRequest(() =>
      client.subscriptions.retrieve(subscription.subscription_id),
    )) as any
    if (actual.status !== 'cancelled') fail('payment_confirmation_pending')
    terminal = true
  }
  if ((!bound || accountDeleted) && !terminal) fail('payment_grant_superseded')
  const extend = !terminal && bound && now < at && prior.expires_at !== at
  const restore =
    terminal &&
    !accountDeleted &&
    known &&
    bound &&
    prior.revision === expectedRevision &&
    prior.expires_at === at
  const grantRevision =
    extend || restore ? prior.revision + 1 : (prior?.revision ?? null)
  const status = terminal
    ? 'canceled'
    : now >= at ||
        ['on_hold', 'past_due', 'paused'].includes(subscription.status)
      ? 'past_due'
      : 'active'
  const eventId = crypto.randomUUID()
  const writes = [
    db
      .prepare(
        `INSERT INTO platform_payment_subscriptions(id,workspace_id,checkout_id,customer_id,product_id,plan_id,interval,quota_anchor,status,period_start,period_end,provider_updated_at,checked_at,next_check_at,error,provider,environment,provider_key,price,currency,activation_state,handover_at,handover_revision) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'dodo',?,?,?,?,'authorized',?,? WHERE ${fence} ON CONFLICT(id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,error=excluded.error,handover_revision=excluded.handover_revision,revision=platform_payment_subscriptions.revision+1`,
      )
      .bind(
        localId,
        checkout.workspace_id,
        checkout.id,
        subscription.customer.customer_id,
        checkout.product_id,
        checkout.plan_id,
        checkout.interval,
        at,
        status,
        Math.min(now, at - 1),
        at,
        now,
        now,
        now + 300000,
        terminal
          ? 'payment_handover_cancelled'
          : now >= at
            ? 'payment_confirmation_pending'
            : null,
        checkout.environment,
        checkout.provider_key,
        checkout.price,
        checkout.currency,
        at,
        terminal ? null : grantRevision,
        ...fenceValues,
      ),
    db
      .prepare(
        `UPDATE platform_payment_checkouts SET state=?,error=?,updated_at=? WHERE id=? AND ${fence}`,
      )
      .bind(
        terminal ? 'expired' : 'completed',
        terminal ? 'payment_handover_cancelled' : null,
        now,
        checkout.id,
        ...fenceValues,
      ),
  ]
  if (extend || restore) {
    const expiresAt = restore ? snapshot.expiresAt : at
    writes.push(
      db
        .prepare(
          `INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) SELECT ?,?,'payment_handover',?,?,? WHERE ${fence} AND EXISTS(SELECT 1 FROM platform_workspace_plans WHERE workspace_id=? AND revision=?)`,
        )
        .bind(
          eventId,
          checkout.workspace_id,
          JSON.stringify({ expiresAt: prior.expires_at, source: prior.source }),
          JSON.stringify({
            expiresAt,
            source: snapshot.source,
            reservation: localId,
          }),
          now,
          ...fenceValues,
          checkout.workspace_id,
          prior.revision,
        ),
    )
    writes.push(
      db
        .prepare(
          'UPDATE platform_workspace_plans SET plan_id=?,source=?,starts_at=?,expires_at=?,revision=revision+1 WHERE workspace_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_subscription_events WHERE id=?)',
        )
        .bind(
          snapshot.planId,
          snapshot.source,
          snapshot.startsAt,
          expiresAt,
          checkout.workspace_id,
          prior.revision,
          eventId,
        ),
      ...subscriptionInvalidation(db, checkout.workspace_id, eventId),
    )
  }
  const results = await db.batch(writes)
  if (!results[0]?.meta.changes)
    throw new SubscriptionError(409, 'payment_entitlement_changed')
  return { handled: true, paymentId }
}
