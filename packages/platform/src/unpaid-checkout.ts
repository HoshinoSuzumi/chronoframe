import type { PlatformD1 } from './index.ts'
import { dodoRequest } from './dodo-client.ts'
import { SubscriptionError } from './subscriptions.ts'

/** Call only after binding the authoritative payment and subscription to our checkout. */
export async function closeFailedInitialCheckout(
  db: PlatformD1,
  client: any,
  checkout: any,
  subscription: any,
  payment: any,
  known: any,
  now: number,
  fence: string,
  fenceValues: (string | number | null)[],
) {
  // Session links last 24 hours. Only pre-charge states may be abandoned on age;
  // processing, customer authentication, and capture states must keep reconciling.
  const expiredBeforeCharge =
    now - checkout.created_at > 86400000 &&
    ['requires_payment_method', 'requires_confirmation'].includes(
      payment?.status,
    )
  if (
    known ||
    subscription.status !== 'pending' ||
    (!['failed', 'cancelled'].includes(payment?.status) && !expiredBeforeCharge)
  )
    return false
  await dodoRequest(() =>
    client.subscriptions.update(
      subscription.subscription_id,
      { status: 'cancelled' },
      { headers: { 'Idempotency-Key': `cf-close-unpaid-${checkout.id}` } },
    ),
  )
  const actual = (await dodoRequest(() =>
    client.subscriptions.retrieve(subscription.subscription_id),
  )) as any
  if (actual.status !== 'cancelled')
    throw new SubscriptionError(409, 'payment_confirmation_pending')
  const result = await db
    .prepare(
      `UPDATE platform_payment_checkouts SET state='expired',error='payment_not_completed',updated_at=? WHERE id=? AND state IN('creating','open','uncertain') AND NOT EXISTS(SELECT 1 FROM platform_payment_subscriptions WHERE checkout_id=platform_payment_checkouts.id) AND ${fence}`,
    )
    .bind(now, checkout.id, ...fenceValues)
    .run()
  if (!result.meta.changes)
    throw new SubscriptionError(409, 'payment_entitlement_changed')
  return true
}
