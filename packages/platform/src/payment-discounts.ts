import type DodoPayments from 'dodopayments'
import type { Payment } from 'dodopayments/resources/payments'
import type { Subscription } from 'dodopayments/resources/subscriptions'
import { dodoRequest } from './dodo-client.ts'

interface DiscountCheckout {
  coupon_enabled: number
  product_id: string
  currency: string
  price: number
  interval: number
}

/** Applied discount snapshots are read only from the authenticated payment response. */
export function appliedDiscounts(payment: Payment, checkout: DiscountCheckout) {
  if (
    !checkout.coupon_enabled ||
    !Array.isArray(payment?.discounts) ||
    payment.discounts.length < 1 ||
    payment.discounts.length > 20 ||
    !payment.business_id
  )
    return false
  const ids = new Set<string>()
  for (const [position, discount] of payment.discounts.entries()) {
    if (
      !discount ||
      typeof discount.discount_id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(discount.discount_id) ||
      ids.has(discount.discount_id) ||
      discount.position !== position ||
      discount.business_id !== payment.business_id ||
      !['percentage', 'flat'].includes(discount.type) ||
      !Number.isSafeInteger(discount.amount) ||
      discount.amount < 1 ||
      (discount.type === 'percentage' && discount.amount > 10000) ||
      !Array.isArray(discount.restricted_to) ||
      (discount.restricted_to.length &&
        !discount.restricted_to.includes(checkout.product_id))
    )
      return false
    ids.add(discount.discount_id)
  }
  return (
    !payment.discount_id ||
    payment.discount_id === payment.discounts[0]?.discount_id
  )
}

/** Verify the billed product and final discounted total using its settled line item. */
export async function discountedPaymentMatches(
  client: Pick<DodoPayments, 'payments'>,
  checkout: DiscountCheckout,
  payment: Payment,
) {
  if (
    !appliedDiscounts(payment, checkout) ||
    payment.status !== 'succeeded' ||
    payment.includes_usage ||
    payment.refunds?.length ||
    payment.disputes?.length ||
    !Number.isSafeInteger(payment.total_amount) ||
    payment.total_amount < 0
  )
    return false
  const expected =
    payment.currency === checkout.currency
      ? payment.total_amount
      : payment.settlement_currency === checkout.currency
        ? payment.settlement_amount
        : null
  if (
    expected === null ||
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected > checkout.price
  )
    return false
  const lines = await dodoRequest(() =>
    client.payments.retrieveLineItems(
      payment.payment_id,
      payment.currency === checkout.currency
        ? { currency: payment.currency }
        : undefined,
    ),
  )
  if (lines.currency !== checkout.currency || lines.items?.length !== 1)
    return false
  const item = lines.items[0]
  return (
    !!item &&
    item.items_id === checkout.product_id &&
    Number.isSafeInteger(item.amount) &&
    item.amount >= 0 &&
    Number.isSafeInteger(item.tax) &&
    item.tax >= 0 &&
    Number.isSafeInteger(item.amount + item.tax) &&
    item.amount + item.tax === expected
  )
}

/** A free recurring invoice may omit service_periods; never infer a period from a setup authorization. */
export function freeDiscountPeriod(
  payment: Payment,
  subscription: Subscription,
  checkout: DiscountCheckout,
  notBefore: number,
) {
  if (
    !appliedDiscounts(payment, checkout) ||
    payment.status !== 'succeeded' ||
    payment.total_amount !== 0 ||
    payment.includes_usage ||
    payment.is_update_payment_method ||
    payment.is_multi_subscription ||
    !['new', 'renewal'].includes(payment.charge_type ?? '') ||
    subscription.status !== 'active' ||
    payment.service_periods?.length
  )
    return null
  const start = Date.parse(subscription.previous_billing_date),
    end = Date.parse(subscription.next_billing_date),
    created = Date.parse(payment.created_at)
  if (
    ![start, end, created].every(Number.isFinite) ||
    start < notBefore - 60000 ||
    Math.abs(start - created) > 300000 ||
    end <= start ||
    end - start > (checkout.interval * 31 + 1) * 86400000
  )
    return null
  return {
    subscription_id: subscription.subscription_id,
    starts_at: subscription.previous_billing_date,
    ends_at: subscription.next_billing_date,
  }
}
