import type { PlatformD1 } from './index.ts'
import {
  allRows,
  SubscriptionError,
  subscriptionInvalidation,
  EXPIRY_PLAN_SQL,
} from './subscriptions.ts'

export const CREEM_TEST_API = 'https://test-api.creem.io'
const enc = new TextEncoder()
const fail = (status: number, code: string): never => {
  throw new SubscriptionError(status, code)
}
const identifier = (v: unknown) =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v)
const objectId = (v: any): string => (typeof v === 'string' ? v : v?.id)
const time = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : 0
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
      'SELECT enabled,environment,workspace_ids_json,revision,credentials_ciphertext IS NOT NULL AS configured FROM platform_payment_settings WHERE id=1',
    )
    .first<any>()
  return {
    enabled: !!row.enabled,
    environment: 'test' as const,
    workspaceIds: JSON.parse(row.workspace_ids_json) as number[],
    revision: Number(row.revision),
    configured: !!row.configured,
  }
}
export async function creemRequest(
  credentials: PaymentSecrets,
  path: string,
  body?: unknown,
  transport: PaymentFetch = fetch,
) {
  if (!credentials.apiKey.startsWith('creem_test_') || !path.startsWith('/v1/'))
    fail(400, 'payment_test_mode_required')
  let response: Response
  try {
    response = await transport(CREEM_TEST_API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'x-api-key': credentials.apiKey,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return fail(502, 'payment_provider_unavailable')
  }
  if (!response.ok)
    throw Object.assign(
      new SubscriptionError(
        response.status >= 400 && response.status < 500 ? 422 : 502,
        'payment_provider_request_failed',
      ),
      { providerStatus: response.status },
    )
  const text = await response.text()
  if (text.length > 524288) fail(502, 'payment_provider_response_invalid')
  try {
    return JSON.parse(text)
  } catch {
    return fail(502, 'payment_provider_response_invalid')
  }
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
  db: PlatformD1,
  credentials: PaymentSecrets,
  planId: string,
  interval: number,
  productId: string,
  transport: PaymentFetch = fetch,
) {
  if (
    !identifier(planId) ||
    !identifier(productId) ||
    ![1, 3].includes(interval)
  )
    fail(400, 'payment_product_invalid')
  const plan = await db
    .prepare(
      'SELECT id,active,listed,currency,monthly_price,quarterly_price FROM platform_plans WHERE id=?',
    )
    .bind(planId)
    .first<any>()
  if (!plan?.active || !plan.listed) fail(400, 'payment_plan_unavailable')
  const product = await creemRequest(
    credentials,
    '/v1/products?product_id=' + encodeURIComponent(productId),
    undefined,
    transport,
  )
  const price = interval === 1 ? plan.monthly_price : plan.quarterly_price
  if (
    product.mode !== 'test' ||
    product.id !== productId ||
    product.billing_type !== 'recurring' ||
    product.billing_period !==
      (interval === 1 ? 'every-month' : 'every-three-months') ||
    product.currency !== plan.currency ||
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    product.price !== price ||
    (product.usage_prices?.length ?? 0) > 0 ||
    Number(product.trial_period_days ?? 0) > 0 ||
    (product.status !== undefined && product.status !== 'active')
  )
    fail(422, 'payment_product_mismatch')
  return {
    productId,
    price: Number(price),
    currency: String(plan.currency),
    name: String(product.name || productId),
  }
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
  const pending = await db
    .prepare(
      "SELECT id,state,plan_id,interval,error,checkout_url FROM platform_payment_checkouts WHERE workspace_id=? AND state IN('creating','open','uncertain') ORDER BY created_at DESC LIMIT 1",
    )
    .bind(workspaceId)
    .first<any>()
  const offers =
    settings.enabled &&
    settings.configured &&
    settings.workspaceIds.includes(workspaceId)
      ? await allRows<any>(
          db.prepare(
            'SELECT m.plan_id,m.interval FROM platform_payment_products m JOIN platform_plans p ON p.id=m.plan_id WHERE m.enabled=1 AND p.active=1 AND p.listed=1 AND p.currency=m.currency AND m.price=CASE WHEN m.interval=1 THEN p.monthly_price ELSE p.quarterly_price END',
          ),
        )
      : []
  return {
    environment: 'test',
    enabled: offers.length > 0,
    canManage: membership.role === 'admin',
    offers,
    subscriptions,
    pending: pending
      ? {
          id: pending.id,
          state: pending.state,
          planId: pending.plan_id,
          interval: pending.interval,
          error: pending.error,
          url:
            membership.role === 'admin' &&
            pending.state === 'open' &&
            pending.checkout_url
              ? paymentURL(pending.checkout_url)
              : null,
        }
      : null,
  }
}
async function paymentRequestBudget(
  db: PlatformD1,
  userId: number,
  now = Date.now(),
) {
  const window = Math.floor(now / 60000) * 60000
  const row = await db
    .prepare(
      'INSERT INTO platform_payment_requests(user_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=attempts+1 WHERE attempts<20 RETURNING attempts',
    )
    .bind(userId, window)
    .first()
  if (!row) fail(429, 'payment_rate_limited')
}
async function acquireWorkspace(
  db: PlatformD1,
  workspaceId: number,
  now: number,
) {
  const token = crypto.randomUUID()
  const row = await db
    .prepare(
      'INSERT INTO platform_payment_locks(workspace_id,token,expires_at) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE platform_payment_locks.expires_at<? RETURNING token',
    )
    .bind(workspaceId, token, now + 60000, now)
    .first<any>()
  if (!row || row.token !== token) fail(409, 'payment_busy')
  return token
}
async function releaseWorkspace(
  db: PlatformD1,
  workspaceId: number,
  token: string,
) {
  await db
    .prepare(
      'DELETE FROM platform_payment_locks WHERE workspace_id=? AND token=?',
    )
    .bind(workspaceId, token)
    .run()
}

/** A checkout snapshots the authenticated workspace and plan; a return URL can never grant access. */
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
  const user = await paymentMember(db, userId, input.workspaceId, true)
  if (
    !identifier(input.requestId) ||
    !identifier(input.planId) ||
    ![1, 3].includes(input.interval)
  )
    fail(400, 'payment_checkout_invalid')
  const settings = await paymentSettings(db)
  if (
    !settings.enabled ||
    !settings.configured ||
    !settings.workspaceIds.includes(input.workspaceId)
  )
    fail(403, 'payment_checkout_disabled')
  const token = await acquireWorkspace(db, input.workspaceId, now)
  try {
    const previous = await db
      .prepare(
        'SELECT * FROM platform_payment_checkouts WHERE user_id=? AND request_id=?',
      )
      .bind(userId, input.requestId)
      .first<any>()
    if (previous) {
      if (
        previous.workspace_id !== input.workspaceId ||
        previous.plan_id !== input.planId ||
        previous.interval !== input.interval
      )
        fail(409, 'payment_request_reused')
      if (previous.state === 'open' && previous.checkout_url)
        return {
          url: paymentURL(previous.checkout_url),
          checkoutId: previous.id,
        }
      return fail(409, 'payment_confirmation_pending')
    }
    const active = await db
      .prepare(
        "SELECT id FROM platform_payment_subscriptions WHERE workspace_id=? AND status NOT IN('expired','canceled') LIMIT 1",
      )
      .bind(input.workspaceId)
      .first()
    if (active) fail(409, 'payment_subscription_exists')
    const pending = await db
      .prepare(
        "SELECT id FROM platform_payment_checkouts WHERE workspace_id=? AND state IN('creating','open','uncertain') LIMIT 1",
      )
      .bind(input.workspaceId)
      .first()
    if (pending) fail(409, 'payment_confirmation_pending')
    const mapping = await db
      .prepare(
        'SELECT * FROM platform_payment_products WHERE plan_id=? AND interval=? AND enabled=1',
      )
      .bind(input.planId, input.interval)
      .first<any>()
    if (!mapping) fail(400, 'payment_product_unavailable')
    await paymentRequestBudget(db, userId, now)
    const credentials = await paymentSecrets(db, rootKey)
    const product = await validatePaymentProduct(
      db,
      credentials,
      input.planId,
      input.interval,
      mapping.product_id,
      transport,
    )
    const id = crypto.randomUUID(),
      assignment = await db
        .prepare(
          'SELECT revision FROM platform_workspace_plans WHERE workspace_id=?',
        )
        .bind(input.workspaceId)
        .first<any>()
    await db
      .prepare(
        "INSERT INTO platform_payment_checkouts(id,workspace_id,user_id,request_id,plan_id,interval,product_id,price,currency,assignment_revision,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'creating',?,?)",
      )
      .bind(
        id,
        input.workspaceId,
        userId,
        input.requestId,
        input.planId,
        input.interval,
        mapping.product_id,
        product.price,
        product.currency,
        assignment?.revision ?? 0,
        now,
        now,
      )
      .run()
    try {
      const success = new URL('/account/plan', portalOrigin)
      success.searchParams.set('workspaceId', String(input.workspaceId))
      success.searchParams.set('checkout', id)
      const checkout = await creemRequest(
        credentials,
        '/v1/checkouts',
        {
          request_id: id,
          product_id: mapping.product_id,
          units: 1,
          customer: { email: user.email },
          success_url: success.href,
          metadata: {
            chronoframe_checkout_id: id,
            referenceId: String(userId),
            workspaceId: String(input.workspaceId),
          },
        },
        transport,
      )
      if (
        !identifier(checkout.id) ||
        checkout.mode !== 'test' ||
        checkout.request_id !== id ||
        objectId(checkout.product) !== mapping.product_id
      )
        fail(502, 'payment_checkout_response_invalid')
      const url = paymentURL(checkout.checkout_url)
      await db
        .prepare(
          "UPDATE platform_payment_checkouts SET provider_id=?,checkout_url=?,state='open',updated_at=? WHERE id=? AND state='creating'",
        )
        .bind(checkout.id, url, now, id)
        .run()
      return { url, checkoutId: id }
    } catch (error) {
      const rejected =
        error instanceof SubscriptionError &&
        [400, 401, 403, 404, 422].includes(
          Number(
            (error as SubscriptionError & { providerStatus?: number })
              .providerStatus,
          ),
        )
      // Definitive 4xx rejections can be retried after configuration repair; unknown outcomes cannot.
      if (rejected) {
        await db
          .prepare(
            "UPDATE platform_payment_checkouts SET state='expired',error='payment_checkout_rejected',updated_at=? WHERE id=? AND state='creating'",
          )
          .bind(now, id)
          .run()
        throw error
      }
      // Never repeat an ambiguous provider create: the provider may have created a payable session.
      await db
        .prepare(
          "UPDATE platform_payment_checkouts SET state='uncertain',error='payment_confirmation_pending',updated_at=? WHERE id=? AND state='creating'",
        )
        .bind(now, id)
        .run()
      return fail(502, 'payment_confirmation_pending')
    }
  } finally {
    await releaseWorkspace(db, input.workspaceId, token)
  }
}
export async function createPaymentPortal(
  db: PlatformD1,
  rootKey: string,
  userId: number,
  workspaceId: number,
  transport: PaymentFetch = fetch,
) {
  const member = await paymentMember(db, userId, workspaceId, true)
  const row = await db
    .prepare(
      'SELECT s.customer_id,c.user_id FROM platform_payment_subscriptions s JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE s.workspace_id=? ORDER BY s.checked_at DESC LIMIT 1',
    )
    .bind(workspaceId)
    .first<any>()
  if (!row) fail(404, 'payment_customer_unavailable')
  if (
    row.user_id !== userId ||
    (await db
      .prepare(
        "SELECT 1 FROM platform_payment_subscriptions s WHERE s.customer_id=? AND NOT EXISTS(SELECT 1 FROM platform_memberships m WHERE m.workspace_id=s.workspace_id AND m.user_id=? AND m.role='admin') LIMIT 1",
      )
      .bind(row.customer_id, userId)
      .first())
  )
    fail(403, 'payment_customer_scope_conflict')
  await paymentRequestBudget(db, userId)
  const credentials = await paymentSecrets(db, rootKey)
  const customer = await creemRequest(
    credentials,
    '/v1/customers?customer_id=' + encodeURIComponent(row.customer_id),
    undefined,
    transport,
  )
  if (
    customer.mode !== 'test' ||
    customer.id !== row.customer_id ||
    String(customer.email).toLowerCase() !== member.email.toLowerCase()
  )
    fail(403, 'payment_customer_scope_conflict')
  const response = await creemRequest(
    credentials,
    '/v1/customers/billing',
    { customer_id: row.customer_id },
    transport,
  )
  return { url: paymentURL(response.customer_portal_link) }
}

/** Verify the exact raw bytes before parsing, and deduplicate durably before acknowledging delivery. */
export async function receivePaymentEvent(
  db: PlatformD1,
  rootKey: string,
  body: Uint8Array,
  signature: string,
  now = Date.now(),
) {
  if (body.byteLength > 65536 || !/^[a-fA-F0-9]{64}$/.test(signature))
    fail(400, 'payment_signature_invalid')
  const secret = (await paymentSecrets(db, rootKey)).webhookSecret
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const expected = Uint8Array.from(signature.match(/../g)!, (b) =>
    parseInt(b, 16),
  )
  if (
    !(await crypto.subtle.verify('HMAC', key, expected, Uint8Array.from(body)))
  )
    fail(400, 'payment_signature_invalid')
  let event: any
  try {
    event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } catch {
    return fail(400, 'payment_event_invalid')
  }
  if (
    !identifier(event.id) ||
    typeof event.eventType !== 'string' ||
    event.eventType.length > 100 ||
    !identifier(event.object?.id) ||
    event.object.mode !== 'test' ||
    !Number.isSafeInteger(event.created_at) ||
    event.created_at < 1
  )
    fail(400, 'payment_event_invalid')
  const type = event.eventType as string
  const supported =
    type === 'checkout.completed' ||
    /^subscription\.(active|paid|trialing|canceled|scheduled_cancel|past_due|unpaid|expired|paused|update)$/.test(
      type,
    )
  const ref =
    event.object.request_id || event.object.metadata?.chronoframe_checkout_id
  await db
    .prepare(
      'INSERT OR IGNORE INTO platform_payment_events(id,type,object_id,reference_id,created_at,state,available_at) VALUES(?,?,?,?,?,?,?)',
    )
    .bind(
      event.id,
      type,
      event.object.id,
      identifier(ref) ? ref : null,
      event.created_at,
      supported ? 'pending' : 'ignored',
      now,
    )
    .run()
  return { received: true }
}

async function synchronizePayment(
  db: PlatformD1,
  rootKey: string,
  event: any,
  transport: PaymentFetch,
  now: number,
) {
  const credentials = await paymentSecrets(db, rootKey)
  let checkout: any, providerCheckout: any, subscriptionId: string
  if (event.type === 'checkout.completed') {
    providerCheckout = await creemRequest(
      credentials,
      '/v1/checkouts?checkout_id=' + encodeURIComponent(event.object_id),
      undefined,
      transport,
    )
    checkout = await db
      .prepare('SELECT * FROM platform_payment_checkouts WHERE id=?')
      .bind(String(providerCheckout.request_id ?? ''))
      .first<any>()
    subscriptionId = objectId(providerCheckout.subscription)
  } else {
    const known = await db
      .prepare(
        'SELECT checkout_id FROM platform_payment_subscriptions WHERE id=?',
      )
      .bind(event.object_id)
      .first<any>()
    const probe = known
      ? null
      : await creemRequest(
          credentials,
          '/v1/subscriptions?subscription_id=' +
            encodeURIComponent(event.object_id),
          undefined,
          transport,
        )
    checkout = await db
      .prepare('SELECT * FROM platform_payment_checkouts WHERE id=?')
      .bind(
        String(
          known?.checkout_id ||
            probe?.metadata?.chronoframe_checkout_id ||
            event.reference_id ||
            '',
        ),
      )
      .first<any>()
    subscriptionId = event.object_id
  }
  if (!checkout || !checkout.user_id) return 'ignored'
  if (!identifier(subscriptionId)) fail(409, 'payment_confirmation_pending')
  const token = await acquireWorkspace(db, checkout.workspace_id, now)
  try {
    if (
      await db
        .prepare('SELECT id FROM platform_subscription_events WHERE id=?')
        .bind('creem:' + event.id)
        .first()
    )
      return 'done'
    // Fetch after acquiring the workspace lease so out-of-order deliveries read current provider state.
    const s = await creemRequest(
      credentials,
      '/v1/subscriptions?subscription_id=' + encodeURIComponent(subscriptionId),
      undefined,
      transport,
    )
    if (!providerCheckout) {
      if (!checkout.provider_id) fail(409, 'payment_confirmation_pending')
      providerCheckout = await creemRequest(
        credentials,
        '/v1/checkouts?checkout_id=' + encodeURIComponent(checkout.provider_id),
        undefined,
        transport,
      )
    }
    if (
      providerCheckout.mode !== 'test' ||
      providerCheckout.status !== 'completed' ||
      providerCheckout.request_id !== checkout.id ||
      objectId(providerCheckout.product) !== checkout.product_id ||
      objectId(providerCheckout.subscription) !== subscriptionId ||
      s.id !== subscriptionId ||
      s.mode !== 'test' ||
      objectId(s.customer) !== objectId(providerCheckout.customer) ||
      !identifier(objectId(s.customer))
    )
      fail(422, 'payment_binding_invalid')
    const known = await db
      .prepare('SELECT * FROM platform_payment_subscriptions WHERE id=?')
      .bind(subscriptionId)
      .first<any>()
    if (
      known &&
      (known.workspace_id !== checkout.workspace_id ||
        known.checkout_id !== checkout.id)
    )
      fail(422, 'payment_binding_invalid')
    let planId = checkout.plan_id,
      interval = checkout.interval
    if (known && objectId(s.product) === known.product_id) {
      planId = known.plan_id
      interval = known.interval
    } else if (objectId(s.product) !== checkout.product_id) {
      const mapping = await db
        .prepare(
          'SELECT plan_id,interval FROM platform_payment_products WHERE product_id=? AND enabled=1',
        )
        .bind(String(objectId(s.product)))
        .first<any>()
      if (!known || !mapping) fail(422, 'payment_product_unavailable')
      planId = mapping.plan_id
      interval = mapping.interval
    }
    // Keep the immutable checkout quote; catalog edits must not invalidate an already paid purchase.
    // Only an existing subscription changing products needs a freshly validated mapping.
    if (known && known.product_id !== objectId(s.product))
      await validatePaymentProduct(
        db,
        credentials,
        planId,
        interval,
        objectId(s.product),
        transport,
      )
    const terminal = ['expired', 'paused', 'canceled', 'unpaid'].includes(
      s.status,
    )
    const start =
        time(s.current_period_start_date) ||
        (terminal ? known?.period_start || checkout.created_at : 0),
      end =
        time(s.current_period_end_date) ||
        (terminal ? known?.period_end || now + 1 : 0),
      updated = time(s.updated_at)
    if (
      !updated ||
      !start ||
      end <= start ||
      start > now + 1000 ||
      ![
        'active',
        'trialing',
        'scheduled_cancel',
        'past_due',
        'expired',
        'paused',
        'canceled',
        'unpaid',
      ].includes(s.status)
    )
      fail(422, 'payment_subscription_invalid')
    if (known && updated < known.provider_updated_at) return 'done'
    const prior = await db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=?')
      .bind(checkout.workspace_id)
      .first<any>()
    const account = await db
      .prepare(
        'SELECT 1 FROM platform_account_deletions WHERE user_id=(SELECT owner_user_id FROM platform_workspaces WHERE id=?)',
      )
      .bind(checkout.workspace_id)
      .first()
    if (account) fail(409, 'payment_account_unavailable')
    const canAssign = known
      ? prior?.payment_subscription_id === subscriptionId &&
        ['payment', 'expired_default'].includes(prior.source)
      : (prior?.revision ?? 0) === checkout.assignment_revision ||
        (prior?.source === 'expired_default' &&
          prior.revision === checkout.assignment_revision + 1)
    const entitled = [
      'active',
      'trialing',
      'scheduled_cancel',
      'past_due',
    ].includes(s.status)
    const until =
      s.status === 'past_due'
        ? Math.min(end, known?.period_end ?? Math.min(start, now))
        : end
    const active = entitled && until > now
    const anchor =
      known && known.plan_id === planId ? known.quota_anchor : start
    const assignmentNeedsWrite =
      canAssign &&
      (prior?.source !== (active ? 'payment' : 'expired_default') ||
        (active &&
          (prior.plan_id !== planId ||
            prior.starts_at !== anchor ||
            prior.expires_at !== until ||
            prior.billing_interval !== interval)))
    // A reconciliation heartbeat is not a new payment or a new entitlement revision.
    // Still restore a linked paid subscription after a temporary grant expires.
    if (
      known &&
      updated === known.provider_updated_at &&
      known.status === s.status &&
      known.product_id === objectId(s.product) &&
      known.plan_id === planId &&
      known.interval === interval &&
      known.period_start === start &&
      known.period_end === until &&
      !assignmentNeedsWrite
    ) {
      await db
        .prepare(
          'UPDATE platform_payment_subscriptions SET checked_at=?,next_check_at=?,error=? WHERE id=? AND EXISTS(SELECT 1 FROM platform_payment_locks WHERE workspace_id=? AND token=? AND expires_at>?)',
        )
        .bind(
          now,
          Math.max(now + 60000, Math.min(now + 900000, until)),
          canAssign ? null : 'payment_grant_superseded',
          subscriptionId,
          checkout.workspace_id,
          token,
          now,
        )
        .run()
      return 'done'
    }
    const eventId = 'creem:' + event.id
    const fence =
      'EXISTS(SELECT 1 FROM platform_payment_locks WHERE workspace_id=? AND token=? AND expires_at>?)'
    const after = {
      source: 'payment',
      planId,
      status: s.status,
      periodStart: start,
      periodEnd: until,
      assigned: canAssign,
      subscriptionId,
      environment: 'test',
    }
    const statements = [
      db
        .prepare(
          `INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) SELECT ?,?,'payment',?,?,? WHERE ${fence}`,
        )
        .bind(
          eventId,
          checkout.workspace_id,
          JSON.stringify({
            planId: prior?.plan_id,
            source: prior?.source,
            revision: prior?.revision,
          }),
          JSON.stringify(after),
          now,
          checkout.workspace_id,
          token,
          now,
        ),
      db
        .prepare(
          `INSERT INTO platform_payment_subscriptions(id,workspace_id,checkout_id,customer_id,product_id,plan_id,interval,quota_anchor,status,period_start,period_end,provider_updated_at,checked_at,next_check_at,error) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id,plan_id=excluded.plan_id,interval=excluded.interval,quota_anchor=excluded.quota_anchor,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,provider_updated_at=excluded.provider_updated_at,checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,error=excluded.error,revision=platform_payment_subscriptions.revision+1`,
        )
        .bind(
          subscriptionId,
          checkout.workspace_id,
          checkout.id,
          objectId(s.customer),
          objectId(s.product),
          planId,
          interval,
          anchor,
          s.status,
          start,
          until,
          updated,
          now,
          Math.max(now + 60000, Math.min(now + 900000, until)),
          canAssign ? null : 'payment_grant_superseded',
          checkout.workspace_id,
          token,
          now,
        ),
      db
        .prepare(
          `UPDATE platform_payment_checkouts SET provider_id=?,state='completed',error=NULL,updated_at=? WHERE id=? AND ${fence}`,
        )
        .bind(
          providerCheckout.id,
          now,
          checkout.id,
          checkout.workspace_id,
          token,
          now,
        ),
    ]
    if (canAssign) {
      statements.push(
        db
          .prepare(
            `UPDATE platform_workspace_plans SET plan_id=${active ? '?' : EXPIRY_PLAN_SQL},source=?,starts_at=?,expires_at=?,billing_interval=?,payment_subscription_id=?,revision=revision+1 WHERE workspace_id=? AND revision=? AND ${fence}`,
          )
          .bind(
            ...(active ? [planId] : []),
            active ? 'payment' : 'expired_default',
            anchor,
            active ? until : null,
            active ? interval : null,
            subscriptionId,
            checkout.workspace_id,
            prior?.revision ?? 0,
            checkout.workspace_id,
            token,
            now,
          ),
      )
      statements.push(
        ...subscriptionInvalidation(db, checkout.workspace_id, eventId),
      )
    }
    const results = await db.batch(statements)
    if (!results[0]?.meta.changes) fail(409, 'payment_lease_lost')
    return 'done'
  } finally {
    await releaseWorkspace(db, checkout.workspace_id, token)
  }
}
/** Durable signed-event inbox. Retries use authoritative API reads, not stale event snapshots. */
export async function processPaymentEvents(
  db: PlatformD1,
  rootKey: string,
  transport: PaymentFetch = fetch,
  now = Date.now(),
  limit = 5,
) {
  await db
    .prepare(
      "UPDATE platform_payment_events SET state=CASE WHEN EXISTS(SELECT 1 FROM platform_subscription_events r WHERE r.id='creem:'||platform_payment_events.id) THEN 'done' ELSE 'failed' END,error=CASE WHEN EXISTS(SELECT 1 FROM platform_subscription_events r WHERE r.id='creem:'||platform_payment_events.id) THEN NULL ELSE 'payment_attempts_exhausted' END,lease_token=NULL,lease_until=NULL WHERE state='pending' AND attempts>=8 AND (lease_until IS NULL OR lease_until<?)",
    )
    .bind(now)
    .run()
  const rows = await allRows<any>(
    db
      .prepare(
        "SELECT * FROM platform_payment_events WHERE state='pending' AND attempts<8 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY available_at,id LIMIT ?",
      )
      .bind(now, now, limit),
  )
  let processed = 0
  for (const row of rows) {
    const token = crypto.randomUUID()
    const claim = await db
      .prepare(
        "UPDATE platform_payment_events SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND state='pending' AND attempts<8 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING attempts",
      )
      .bind(token, now + 60000, row.id, now, now)
      .first<any>()
    if (!claim) continue
    try {
      const state = await synchronizePayment(db, rootKey, row, transport, now)
      await db
        .prepare(
          'UPDATE platform_payment_events SET state=?,error=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?',
        )
        .bind(state, row.id, token)
        .run()
      processed++
    } catch (e) {
      const code =
        e instanceof SubscriptionError ? e.code : 'payment_sync_failed'
      await db
        .prepare(
          'UPDATE platform_payment_events SET state=?,error=?,available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?',
        )
        .bind(
          claim.attempts >= 8 ? 'failed' : 'pending',
          code,
          now + Math.min(3600000, 30000 * 2 ** Math.min(7, claim.attempts - 1)),
          row.id,
          token,
        )
        .run()
    }
  }
  return { processed }
}
export async function reconcilePayments(
  db: PlatformD1,
  rootKey: string,
  transport: PaymentFetch = fetch,
  now = Date.now(),
) {
  const settings = await paymentSettings(db)
  if (!settings.configured) return
  const due = await allRows<any>(
    db
      .prepare(
        "SELECT id FROM platform_payment_subscriptions WHERE next_check_at<=? AND status NOT IN('expired','canceled') ORDER BY next_check_at LIMIT 3",
      )
      .bind(now),
  )
  for (const row of due) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO platform_payment_events(id,type,object_id,created_at,available_at) VALUES(?,'subscription.update',?,?,?)",
      )
      .bind('sync_' + row.id + '_' + Math.floor(now / 60000), row.id, now, now)
      .run()
    await db
      .prepare(
        'UPDATE platform_payment_subscriptions SET next_check_at=? WHERE id=?',
      )
      .bind(now + 900000, row.id)
      .run()
  }
  // Open and uncertain checkouts are never silently retried or expired locally: verify with Creem first.
  const open = await allRows<any>(
    db
      .prepare(
        "SELECT id,provider_id FROM platform_payment_checkouts WHERE state IN('open','uncertain') AND provider_id IS NOT NULL AND updated_at<? ORDER BY updated_at LIMIT 3",
      )
      .bind(now - 60000),
  )
  for (const row of open) {
    try {
      const checkout = await creemRequest(
        await paymentSecrets(db, rootKey),
        '/v1/checkouts?checkout_id=' + encodeURIComponent(row.provider_id),
        undefined,
        transport,
      )
      if (checkout.mode !== 'test' || checkout.request_id !== row.id) continue
      if (checkout.status === 'expired')
        await db
          .prepare(
            "UPDATE platform_payment_checkouts SET state='expired',updated_at=?,error=NULL WHERE id=? AND state IN('open','uncertain')",
          )
          .bind(now, row.id)
          .run()
      else if (checkout.status === 'completed')
        await db
          .prepare(
            "INSERT OR IGNORE INTO platform_payment_events(id,type,object_id,reference_id,created_at,available_at) VALUES(?,'checkout.completed',?,?,?,?)",
          )
          .bind(
            'checkout_sync_' + row.id + '_' + Math.floor(now / 60000),
            row.provider_id,
            row.id,
            now,
            now,
          )
          .run()
    } catch {
      /* The signed inbox and the next bounded scan retain recoverability. */
    }
  }
  await processPaymentEvents(db, rootKey, transport, now)
  await db
    .prepare('DELETE FROM platform_payment_requests WHERE window_start<?')
    .bind(now - 86400000)
    .run()
}
/** Reattach an ambiguous create only after Creem proves the original immutable request binding. */
export async function recoverPaymentCheckout(
  db: PlatformD1,
  rootKey: string,
  checkoutId: string,
  providerId: string,
  transport: PaymentFetch = fetch,
  now = Date.now(),
) {
  if (!identifier(providerId)) fail(400, 'payment_checkout_invalid')
  const row = await db
    .prepare(
      "SELECT * FROM platform_payment_checkouts WHERE id=? AND state IN('creating','uncertain','open')",
    )
    .bind(checkoutId)
    .first<any>()
  if (!row) fail(404, 'payment_checkout_unavailable')
  const c = await creemRequest(
    await paymentSecrets(db, rootKey),
    '/v1/checkouts?checkout_id=' + encodeURIComponent(providerId),
    undefined,
    transport,
  )
  if (
    c.id !== providerId ||
    c.mode !== 'test' ||
    c.request_id !== row.id ||
    objectId(c.product) !== row.product_id
  )
    fail(422, 'payment_binding_invalid')
  const url = c.status === 'expired' ? null : paymentURL(c.checkout_url)
  await db
    .prepare(
      "UPDATE platform_payment_checkouts SET provider_id=?,checkout_url=?,state=?,error=NULL,updated_at=? WHERE id=? AND state IN('creating','uncertain','open')",
    )
    .bind(
      providerId,
      url,
      c.status === 'expired' ? 'expired' : 'open',
      now,
      checkoutId,
    )
    .run()
  if (c.status === 'completed')
    await db
      .prepare(
        "INSERT OR IGNORE INTO platform_payment_events(id,type,object_id,reference_id,created_at,available_at) VALUES(?,'checkout.completed',?,?,?,?)",
      )
      .bind(
        'recover_' + row.id + '_' + Math.floor(now / 60000),
        providerId,
        row.id,
        now,
        now,
      )
      .run()
  return { ok: true }
}
/** Account erasure cannot remove the local ledger while an upstream subscription can still bill. */
export async function closeAccountPayments(
  db: PlatformD1,
  rootKey: string,
  userId: number,
  transport: PaymentFetch = fetch,
) {
  const open = await allRows<any>(
    db
      .prepare(
        "SELECT c.* FROM platform_payment_checkouts c JOIN platform_workspaces w ON w.id=c.workspace_id WHERE (w.owner_user_id=? OR c.user_id=?) AND c.state IN('creating','open','uncertain')",
      )
      .bind(userId, userId),
  )
  const rows = await allRows<any>(
    db
      .prepare(
        "SELECT s.id,s.workspace_id FROM platform_payment_subscriptions s JOIN platform_workspaces w ON w.id=s.workspace_id JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE (w.owner_user_id=? OR c.user_id=?) AND s.status NOT IN('canceled','expired')",
      )
      .bind(userId, userId),
  )
  if (!open.length && !rows.length) return true
  const credentials = await paymentSecrets(db, rootKey)
  async function cancel(id: string) {
    let s = await creemRequest(
      credentials,
      '/v1/subscriptions?subscription_id=' + encodeURIComponent(id),
      undefined,
      transport,
    )
    if (s.mode !== 'test' || s.id !== id) return false
    if (!['canceled', 'expired'].includes(s.status))
      s = await creemRequest(
        credentials,
        '/v1/subscriptions/' + encodeURIComponent(id) + '/cancel',
        { mode: 'immediate' },
        transport,
      )
    return (
      s.mode === 'test' &&
      s.id === id &&
      ['canceled', 'expired'].includes(s.status)
    )
  }
  for (const row of open) {
    if (!row.provider_id) return false
    const c = await creemRequest(
      credentials,
      '/v1/checkouts?checkout_id=' + encodeURIComponent(row.provider_id),
      undefined,
      transport,
    )
    if (
      c.mode !== 'test' ||
      c.request_id !== row.id ||
      objectId(c.product) !== row.product_id
    )
      return false
    if (c.status === 'expired')
      await db
        .prepare(
          "UPDATE platform_payment_checkouts SET state='expired',updated_at=? WHERE id=?",
        )
        .bind(Date.now(), row.id)
        .run()
    else if (
      c.status === 'completed' &&
      identifier(objectId(c.subscription)) &&
      (await cancel(objectId(c.subscription)))
    )
      await db
        .prepare(
          "UPDATE platform_payment_checkouts SET state='completed',updated_at=? WHERE id=?",
        )
        .bind(Date.now(), row.id)
        .run()
    else return false
  }
  for (const row of rows) {
    if (!(await cancel(row.id))) return false
    const now = Date.now(),
      eventId = 'account-close:' + row.id
    const prior = await db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=?')
      .bind(row.workspace_id)
      .first<any>()
    await db.batch([
      db
        .prepare(
          "INSERT OR IGNORE INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) VALUES(?,?,'payment',?,?,?)",
        )
        .bind(
          eventId,
          row.workspace_id,
          JSON.stringify({ planId: prior?.plan_id, source: prior?.source }),
          JSON.stringify({
            source: 'expired_default',
            subscriptionId: row.id,
            accountClosure: true,
          }),
          now,
        ),
      db
        .prepare(
          "UPDATE platform_payment_subscriptions SET status='canceled',checked_at=?,error=NULL,revision=revision+1 WHERE id=?",
        )
        .bind(now, row.id),
      db
        .prepare(
          `UPDATE platform_workspace_plans SET plan_id=${EXPIRY_PLAN_SQL},source='expired_default',expires_at=NULL,billing_interval=NULL,revision=revision+1 WHERE workspace_id=? AND payment_subscription_id=? AND source IN('payment','expired_default')`,
        )
        .bind(row.workspace_id, row.id),
      ...subscriptionInvalidation(db, row.workspace_id, eventId),
    ])
  }
  return true
}
