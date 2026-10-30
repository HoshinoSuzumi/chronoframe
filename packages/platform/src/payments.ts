import {
  createDodoCheckout,
  refreshDodoCheckout,
  closeDodoAccountPayments,
} from './dodo-payments.ts'
import type { PlatformD1 } from './index.ts'
import { allRows, SubscriptionError } from './subscriptions.ts'

export const CREEM_TEST_API = 'https://test-api.creem.io'
const enc = new TextEncoder()
const fail = (status: number, code: string): never => {
  throw new SubscriptionError(status, code)
}
export type PaymentFetch = typeof fetch
export type PaymentSecrets = { apiKey: string; webhookSecret: string }

/** A distinct HKDF context protects online payment credentials using the existing platform root key. */
async function credentialKey(secret: string) {
  if (secret.length < 32) fail(503, 'payment_encryption_unavailable')
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('chronoframe-payments-v1'),
      info: enc.encode('creem-test-credentials'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
export async function sealPaymentSecrets(
  secret: string,
  value: PaymentSecrets,
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12)),
    key = await credentialKey(secret)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: enc.encode('creem:test') },
      key,
      enc.encode(JSON.stringify(value)),
    ),
  )
  return JSON.stringify([
    btoa(String.fromCharCode(...nonce)),
    btoa(String.fromCharCode(...ciphertext)),
  ])
}
export async function paymentSecrets(
  db: PlatformD1,
  secret: string,
): Promise<PaymentSecrets> {
  const row = await db
    .prepare(
      'SELECT credentials_ciphertext FROM platform_payment_settings WHERE id=1',
    )
    .first<any>()
  if (!row?.credentials_ciphertext) fail(503, 'payment_not_configured')
  try {
    const [nonce, body] = JSON.parse(row.credentials_ciphertext)
    const value = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0)),
        additionalData: enc.encode('creem:test'),
      },
      await credentialKey(secret),
      Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
    )
    return JSON.parse(new TextDecoder().decode(value))
  } catch {
    return fail(503, 'payment_credentials_unavailable')
  }
}
export async function paymentSettings(db: PlatformD1) {
  const row = await db
    .prepare(
      'SELECT s.current_provider,s.enabled,s.purchase_method,s.revision,s.catalog_revision,s.payload_retention_days,p.provider,p.environment,p.credentials_ciphertext IS NOT NULL AS configured FROM platform_payment_settings s LEFT JOIN platform_payment_providers p ON p.id=s.current_provider WHERE s.id=1',
    )
    .first<any>()
  return {
    enabled: !!row.enabled,
    currentProvider: row.current_provider as string | null,
    providerAvailable: row.provider === 'dodo',
    purchaseMethod: row.purchase_method as 'payment' | 'activation_code',
    autoSync: false,
    catalogRevision: Number(row.catalog_revision),
    payloadRetentionDays: Number(row.payload_retention_days),
    environment: row.environment as 'test' | 'live' | null,
    revision: Number(row.revision),
    configured: !!row.configured,
  }
}
export async function creemRequest(
  _credentials: PaymentSecrets,
  _path: string,
  _body?: unknown,
  _transport: PaymentFetch = fetch,
  _options: { method?: 'PATCH'; idempotencyKey?: string } = {},
) {
  throw new SubscriptionError(410, 'payment_provider_retired')
}
export function paymentURL(value: unknown) {
  try {
    const u = new URL(String(value))
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !['creem.io', 'www.creem.io', 'checkout.creem.io'].includes(u.hostname)
    )
      throw 0
    return u.href
  } catch {
    return fail(502, 'payment_redirect_invalid')
  }
}
export async function validatePaymentProduct(
  _db: PlatformD1,
  _credentials: PaymentSecrets,
  _planId: string,
  _interval: number,
  _productId: string,
  _transport: PaymentFetch = fetch,
) {
  throw new SubscriptionError(410, 'payment_provider_retired')
}
export async function paymentMember(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  write = false,
) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1)
    fail(400, 'workspace_unavailable')
  const row = await db
    .prepare(
      'SELECT m.role,u.email FROM platform_memberships m JOIN platform_users u ON u.id=m.user_id LEFT JOIN platform_account_controls c ON c.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND u.email_verified=1 AND COALESCE(c.suspended,0)=0 AND NOT EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=u.id)',
    )
    .bind(workspaceId, userId)
    .first<any>()
  if (!row || (write && row.role !== 'admin'))
    fail(403, 'workspace_admin_required')
  return row as { role: string; email: string }
}
export async function paymentStatus(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
) {
  const membership = await paymentMember(db, userId, workspaceId)
  const settings = await paymentSettings(db)
  const subscriptions = await allRows<any>(
    db
      .prepare(
        'SELECT id,status,period_start,period_end,plan_id,interval,error FROM platform_payment_subscriptions WHERE workspace_id=? ORDER BY checked_at DESC LIMIT 10',
      )
      .bind(workspaceId),
  )

  return {
    environment: settings.environment,
    purchaseMethod: settings.enabled
      ? settings.purchaseMethod
      : 'activation_code',
    enabled:
      settings.enabled &&
      settings.providerAvailable &&
      settings.configured &&
      settings.purchaseMethod === 'payment',
    canManage: membership.role === 'admin',
    offers:
      settings.enabled &&
      settings.providerAvailable &&
      settings.configured &&
      settings.purchaseMethod === 'payment'
        ? await allRows<any>(
            db
              .prepare(
                'SELECT d.plan_id,d.interval FROM platform_dodo_products d JOIN platform_plans p ON p.id=d.plan_id JOIN platform_payment_providers v ON v.id=d.provider_key WHERE d.provider_key=? AND d.credential_revision=v.revision AND d.plan_revision=p.revision AND p.active=1 AND p.listed=1 AND d.price=CASE WHEN d.interval=1 THEN p.monthly_price ELSE p.quarterly_price END AND d.currency=p.currency',
              )
              .bind(settings.currentProvider),
          )
        : [],
    subscriptions,
    hasActiveSubscription: !!(await db
      .prepare(
        "SELECT 1 FROM platform_payment_subscriptions WHERE workspace_id=? AND provider='dodo' AND provider_key=? AND environment=? AND status NOT IN('canceled','expired','failed') LIMIT 1",
      )
      .bind(workspaceId, settings.currentProvider, settings.environment)
      .first()),
    canOpenPortal: !!(
      settings.enabled &&
      settings.providerAvailable &&
      settings.configured &&
      membership.role === 'admin' &&
      (await db
        .prepare(
          "SELECT 1 FROM platform_payment_subscriptions s JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE s.workspace_id=? AND c.user_id=? AND s.provider='dodo' AND s.provider_key=? AND s.environment=? AND s.status IN('active','scheduled_cancel','past_due') AND s.period_end>?",
        )
        .bind(
          workspaceId,
          userId,
          settings.currentProvider,
          settings.environment,
          Date.now(),
        )
        .first())
    ),
    changes: await allRows<any>(
      db
        .prepare(
          "SELECT r.to_plan AS planId,r.direction,d.interval,d.effective_price AS price,d.currency FROM platform_payment_plan_rules r JOIN platform_payment_subscriptions s ON s.plan_id=r.from_plan JOIN platform_workspace_plans w ON w.payment_subscription_id=s.id AND w.source='payment' JOIN platform_dodo_products d ON d.plan_id=r.to_plan AND d.provider_key=s.provider_key AND d.interval=s.interval JOIN platform_plans p ON p.id=d.plan_id JOIN platform_payment_providers v ON v.id=d.provider_key WHERE s.workspace_id=? AND s.provider_key=? AND s.environment=? AND s.status='active' AND s.period_end>? AND r.enabled=1 AND p.active=1 AND p.listed=1 AND d.plan_revision=p.revision AND d.credential_revision=v.revision AND d.effective_price>0 AND d.currency=s.currency",
        )
        .bind(
          workspaceId,
          settings.currentProvider,
          settings.environment,
          Date.now(),
        ),
    ),
    planChange: await db
      .prepare(
        "SELECT id,to_plan AS planId,direction,state FROM platform_payment_plan_changes WHERE workspace_id=? AND provider_key=? AND state IN('submitting','pending','scheduled','uncertain') ORDER BY created_at DESC LIMIT 1",
      )
      .bind(workspaceId, settings.currentProvider)
      .first(),
    pending:
      settings.enabled &&
      settings.providerAvailable &&
      settings.purchaseMethod === 'payment'
        ? await db
            .prepare(
              "SELECT id,state,plan_id AS planId,interval,error,CASE WHEN user_id=? AND ?='admin' THEN 1 ELSE 0 END AS canRefresh,CASE WHEN state='open' AND user_id=? AND ?='admin' THEN checkout_url ELSE NULL END AS url FROM platform_payment_checkouts WHERE workspace_id=? AND provider='dodo' AND environment=? AND provider_key=? AND state IN('creating','open','uncertain') ORDER BY created_at DESC LIMIT 1",
            )
            .bind(
              userId,
              membership.role,
              userId,
              membership.role,
              workspaceId,
              settings.environment,
              settings.currentProvider,
            )
            .first<any>()
        : null,
  }
}

/** Dispatch only the active supported adapter; Creem remains retired. */
export async function createPaymentCheckout(
  db: PlatformD1,
  rootKey: string,
  userId: number,
  input: {
    workspaceId: number
    planId: string
    interval: number
    requestId: string
  },
  portalOrigin: string,
  transport: PaymentFetch = fetch,
  now = Date.now(),
) {
  if (!(await paymentSettings(db)).providerAvailable)
    throw new SubscriptionError(410, 'payment_provider_retired')
  return createDodoCheckout(
    db,
    rootKey,
    userId,
    input,
    portalOrigin,
    transport,
    now,
  )
}
export async function createPaymentPortal(
  db: PlatformD1,
  rootKey: string,
  userId: number,
  workspaceId: number,
  transport: PaymentFetch = fetch,
) {
  const settings = await paymentSettings(db)
  if (!settings.providerAvailable)
    throw new SubscriptionError(410, 'payment_provider_retired')
  await paymentMember(db, userId, workspaceId, true)
  if (!settings.enabled || !settings.providerAvailable || !settings.configured)
    throw new SubscriptionError(503, 'payment_unavailable')
  // A customer portal exposes every subscription for that customer, not just this workspace.
  const sub = await db
    .prepare(
      "SELECT s.* FROM platform_payment_subscriptions s JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE s.workspace_id=? AND c.user_id=? AND s.provider='dodo' AND s.provider_key=? AND s.environment=? AND s.status IN('active','scheduled_cancel','past_due') AND s.period_end>? ORDER BY s.checked_at DESC LIMIT 1",
    )
    .bind(
      workspaceId,
      userId,
      settings.currentProvider,
      settings.environment,
      Date.now(),
    )
    .first<any>()
  if (!sub) throw new SubscriptionError(403, 'payment_portal_unavailable')
  const { dodoClient, dodoRequest, rawDodoId } =
    await import('./dodo-client.ts')
  const { client } = await dodoClient(
    db,
    rootKey,
    sub.environment,
    transport as typeof fetch,
    false,
    sub.provider_key,
  )
  const actual = await dodoRequest(() =>
    client.subscriptions.retrieve(rawDodoId(sub.id)),
  )
  if (actual.customer.customer_id !== sub.customer_id)
    throw new SubscriptionError(422, 'payment_customer_mismatch')
  const portal = await dodoRequest(() =>
    client.customers.customerPortal.create(sub.customer_id, {
      send_email: false,
    }),
  )
  let url: URL
  try {
    url = new URL(portal.link)
  } catch {
    throw new SubscriptionError(502, 'payment_redirect_invalid')
  }
  if (
    url.origin !==
      (sub.environment === 'test'
        ? 'https://test.customer.dodopayments.com'
        : 'https://customer.dodopayments.com') ||
    url.username ||
    url.password
  )
    throw new SubscriptionError(502, 'payment_redirect_invalid')
  return { url: url.href }
}

/** Retired callbacks cannot enter the durable inbox. */
export async function receivePaymentEvent(
  _db: PlatformD1,
  _rootKey: string,
  _body: Uint8Array,
  _signature: string,
  _now = Date.now(),
) {
  throw new SubscriptionError(410, 'payment_provider_retired')
}
/** The historical inbox is retained without replay. */
export async function processPaymentEvents(
  _db: PlatformD1,
  _rootKey: string,
  _transport: PaymentFetch = fetch,
  _now = Date.now(),
  _limit = 5,
  _onlyId?: string,
) {
  // Creem processing is retired; preserve historical records.
}
export async function reconcilePayments(
  _db: PlatformD1,
  _rootKey: string,
  _transport: PaymentFetch = fetch,
  _now = Date.now(),
) {
  // Creem processing is retired; preserve historical records.
}
/** Retired test checkouts cannot be recovered. */
export async function recoverPaymentCheckout(
  _db: PlatformD1,
  _rootKey: string,
  _checkoutId: string,
  _providerId: string,
  _transport: PaymentFetch = fetch,
  _now = Date.now(),
) {
  throw new SubscriptionError(410, 'payment_provider_retired')
}
/** Retired sandbox records do not require an upstream cancellation during erasure. */
export async function closeAccountPayments(
  db: PlatformD1,
  rootKey: string,
  userId: number,
  transport: PaymentFetch = fetch,
) {
  return closeDodoAccountPayments(db, rootKey, userId, transport)
}

/** Reconcile only an authenticated local Dodo checkout; browser provider identifiers are ignored. */
export async function refreshPaymentCheckout(
  db: PlatformD1,
  rootKey: string,
  userId: number,
  workspaceId: number,
  checkoutId: string,
  transport: PaymentFetch = fetch,
  now = Date.now(),
  _hints: { providerCheckoutId?: string; subscriptionId?: string } = {},
) {
  if (!(await paymentSettings(db)).providerAvailable)
    throw new SubscriptionError(410, 'payment_provider_retired')
  return refreshDodoCheckout(
    db,
    rootKey,
    userId,
    workspaceId,
    checkoutId,
    transport,
    now,
  )
}
