import { pricingCatalog } from '../packages/platform/src/billing.ts'
import {
  paymentEventPage,
  paymentEventPayload,
  expirePaymentEventPayloads,
} from '../packages/platform/src/payment-events.ts'
import {
  syncPaymentProducts,
  paymentProductSyncStatus,
} from '../packages/platform/src/payment-product-sync.ts'
import {
  activationHash,
  redeemActivation,
} from '../packages/platform/src/activation.ts'
import {
  accountExemption,
  DEFAULT_EXEMPTIONS,
} from '../packages/platform/src/lifecycle-exemptions.ts'
import { markAccount } from '../packages/platform/src/account-lifecycle.ts'
import { purgeAccounts } from '../packages/platform/src/account-purge.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  creemRequest,
  sealPaymentSecrets,
  paymentSecrets,
  paymentSettings,
  paymentStatus,
  createPaymentCheckout,
  createPaymentPortal,
  receivePaymentEvent,
  processPaymentEvents,
  recoverPaymentCheckout,
  closeAccountPayments,
  validatePaymentProduct,
  reconcilePayments,
  refreshPaymentCheckout,
} from '../packages/platform/src/payments.ts'
import {
  resolveSubscription,
  reconcileSubscriptions,
} from '../packages/platform/src/subscriptions.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
const root = 'local-payment-root-key-'.repeat(3),
  credentials = {
    apiKey: 'creem_test_local_fixture_only',
    webhookSecret: 'fixture-webhook-signature-secret',
  }
async function fixture() {
  const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: '2026-10-26',
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ['DB'],
      }),
    ),
    db = await mf.getD1Database('DB'),
    now = Date.now()
  for (const file of (
    await readdir(new URL('../packages/platform/migrations/', import.meta.url))
  )
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const sql of (
      await readFile(
        new URL('../packages/platform/migrations/' + file, import.meta.url),
        'utf8',
      )
    )
      .replace(/^--.*$/gm, '')
      .match(/\s*CREATE TRIGGER[\s\S]+?END;|[^;]+;/g) ?? [])
      await db.prepare(sql).run()
  }
  await db
    .prepare(
      "INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at) VALUES(1,'owner@example.com','Owner',1,?,?),(2,'other@example.com','Other',1,?,?),(3,'member@example.com','Member',1,?,?)",
    )
    .bind(now, now, now, now, now, now)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_workspaces(id,name,owner_user_id,created_at) VALUES(1,'First',1,?),(2,'Second',2,?)",
    )
    .bind(now, now)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_memberships(workspace_id,user_id,role) VALUES(1,1,'admin'),(2,2,'admin'),(1,3,'member')",
    )
    .run()
  await db
    .prepare(
      "INSERT INTO platform_workspace_plans(workspace_id,plan_id,starts_at,source) VALUES(1,'free',?,'default'),(2,'free',?,'default')",
    )
    .bind(now - 86400000, now)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_plans(id,name,policy_json,currency,monthly_price,quarterly_price) SELECT 'pro','Pro',policy_json,'USD',1200,3000 FROM platform_plans WHERE id='free'",
    )
    .run()
  await db
    .prepare(
      "UPDATE platform_payment_settings SET auto_sync=0,enabled=1,workspace_ids_json='[1]',credentials_ciphertext=?",
    )
    .bind(await sealPaymentSecrets(root, credentials))
    .run()
  await db
    .prepare(
      "INSERT INTO platform_payment_products(plan_id,interval,product_id,price,currency) VALUES('pro',1,'prod_month',1200,'USD'),('pro',3,'prod_quarter',3000,'USD')",
    )
    .run()
  const checkouts = new Map<string, any>(),
    subscriptions = new Map<string, any>(),
    calls: string[] = []
  let broken = false,
    uncertain = false,
    productPrice = 1200,
    rejected = false
  const transport = async (url: any, init: any = {}) => {
    const u = new URL(String(url))
    assert.equal(u.origin, 'https://test-api.creem.io')
    assert.equal(init.headers['x-api-key'], credentials.apiKey)
    assert.equal(init.redirect, 'manual')
    calls.push((init.method ?? 'GET') + ' ' + u.pathname)
    if (broken) return new Response('{}', { status: 503 })
    if (u.pathname === '/v1/products') {
      const quarter = u.searchParams.get('product_id') === 'prod_quarter'
      return Response.json({
        id: quarter ? 'prod_quarter' : 'prod_month',
        mode: 'test',
        billing_type: 'recurring',
        billing_period: quarter ? 'every-three-months' : 'every-month',
        price: quarter ? 3000 : productPrice,
        currency: 'USD',
        name: 'Pro',
      })
    }
    if (u.pathname === '/v1/checkouts' && init.method === 'POST') {
      if (rejected) return Response.json({}, { status: 401 })
      const b = JSON.parse(init.body),
        id = 'chk_' + (checkouts.size + 1)
      const c = {
        id,
        mode: 'test',
        status: 'pending',
        product: { id: b.product_id },
        metadata: b.metadata,
        customer: { id: 'cust_fixture' },
        checkout_url: 'https://checkout.creem.io/' + id,
      }
      checkouts.set(id, c)
      if (uncertain)
        throw new Error('Provider response lost after creating checkout')
      return Response.json(c)
    }
    if (u.pathname === '/v1/checkouts')
      return Response.json(
        checkouts.get(u.searchParams.get('checkout_id')!) ?? {},
      )
    if (u.pathname === '/v1/subscriptions')
      return Response.json(
        subscriptions.get(u.searchParams.get('subscription_id')!) ?? {},
      )
    if (u.pathname === '/v1/customers')
      return Response.json({
        id: 'cust_fixture',
        mode: 'test',
        email: 'owner@example.com',
      })
    if (u.pathname === '/v1/customers/billing')
      return Response.json({
        customer_portal_link: 'https://creem.io/my-orders/login/fixture',
      })
    if (u.pathname.endsWith('/cancel')) {
      const id = u.pathname.split('/')[3],
        s = subscriptions.get(id)
      assert.equal(JSON.parse(init.body).mode, 'immediate')
      s.status = 'canceled'
      return Response.json(s)
    }
    throw new Error('Unexpected Creem operation')
  }
  async function complete(id = 'chk_1') {
    const c = checkouts.get(id),
      s = {
        id: 'sub_' + id,
        mode: 'test',
        status: 'active',
        product: c.product,
        customer: c.customer,
        metadata: c.metadata,
        current_period_start_date: new Date(now - 1000).toISOString(),
        current_period_end_date: new Date(now + 30 * 86400000).toISOString(),
        updated_at: new Date(now).toISOString(),
      }
    c.status = 'completed'
    c.subscription = s.id
    subscriptions.set(s.id, s)
    return s
  }
  async function event(id: string, type: string, object: any, at = now) {
    const body = new TextEncoder().encode(
      JSON.stringify({ id, eventType: type, created_at: at, object }),
    )
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(credentials.webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = [
      ...new Uint8Array(await crypto.subtle.sign('HMAC', key, body)),
    ]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
    return {
      body,
      signature,
      receive: () => receivePaymentEvent(db, root, body, signature, at),
    }
  }
  const input = {
    workspaceId: 1,
    planId: 'pro',
    interval: 1,
    requestId: 'client_request_1',
  }
  return {
    mf,
    db,
    now,
    transport: transport as typeof fetch,
    calls,
    checkouts,
    subscriptions,
    input,
    complete,
    event,
    setRejected(v: boolean) {
      rejected = v
    },
    setBroken(v: boolean) {
      broken = v
    },
    setUncertain(v: boolean) {
      uncertain = v
    },
    setPrice(v: number) {
      productPrice = v
    },
  }
}

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Payment credentials are authenticated-encrypted, test-only, workspace-admin scoped and price checked', async () => {
  const f = await fixture()
  try {
    const stored = await f.db
      .prepare('SELECT credentials_ciphertext FROM platform_payment_settings')
      .first<any>()
    assert.ok(!stored.credentials_ciphertext.includes(credentials.apiKey))
    assert.deepEqual(await paymentSecrets(f.db, root), credentials)
    await assert.rejects(paymentSecrets(f.db, 'different-root-key-'.repeat(4)))
    assert.equal('workspaceIds' in (await paymentSettings(f.db)), false)
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 2)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        3,
        f.input,
        'https://app.chronoframe.art',
        f.transport,
      ),
      { statusCode: 403 },
    )
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        2,
        f.input,
        'https://app.chronoframe.art',
        f.transport,
      ),
      { statusCode: 403 },
    )
    f.setPrice(100)
    await assert.rejects(
      validatePaymentProduct(
        f.db,
        credentials,
        'pro',
        1,
        'prod_month',
        f.transport,
      ),
      { code: 'payment_product_mismatch' },
    )
    assert.equal(f.calls.filter((v) => v === 'POST /v1/checkouts').length, 0)
    f.setPrice(1200)
    // A legacy list containing only workspace 1 must not restrict workspace 2.
    assert.equal((await paymentStatus(f.db, 2, 2)).offers.length, 2)
    await createPaymentCheckout(
      f.db,
      root,
      2,
      { ...f.input, workspaceId: 2, requestId: 'outside_old_list' },
      'https://app.chronoframe.art',
      f.transport,
    )
    await f.db
      .prepare("UPDATE platform_payment_settings SET workspace_ids_json='[]'")
      .run()
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 2)
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
    )
    await f.db.prepare('UPDATE platform_payment_settings SET enabled=0').run()
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 0)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        f.input,
        'https://app.chronoframe.art',
        f.transport,
      ),
      { code: 'payment_checkout_disabled' },
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Concurrent checkout creation, raw signatures, durable deduplication and authoritative grants', async () => {
  const f = await fixture()
  try {
    const results = await Promise.allSettled(
      [1, 2, 3].map(() =>
        createPaymentCheckout(
          f.db,
          root,
          1,
          f.input,
          'https://app.chronoframe.art',
          f.transport,
          f.now,
        ),
      ),
    )
    assert.equal(f.calls.filter((v) => v === 'POST /v1/checkouts').length, 1)
    assert.ok(results.some((v) => v.status === 'fulfilled'))
    assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'free')
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    assert.equal(f.calls.filter((v) => v === 'POST /v1/checkouts').length, 1)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        { ...f.input, interval: 3 },
        'https://app.chronoframe.art',
        f.transport,
        f.now,
      ),
      { code: 'payment_request_reused' },
    )
    const s = await f.complete(),
      e = await f.event(
        'evt_first',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    await assert.rejects(
      receivePaymentEvent(f.db, root, e.body, '0'.repeat(64), f.now),
      { code: 'payment_signature_invalid' },
    )
    const live = await f.event('evt_live', 'checkout.completed', {
      ...f.checkouts.get('chk_1'),
      mode: 'prod',
    })
    await assert.rejects(live.receive(), { code: 'payment_event_invalid' })
    await Promise.all([e.receive(), e.receive(), e.receive()])
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_events')
          .first<any>()
      ).n,
      1,
    )
    await Promise.all(
      [1, 2, 3].map(() => processPaymentEvents(f.db, root, f.transport, f.now)),
    )
    const current = await resolveSubscription(f.db, 1, f.now)
    assert.equal(current.id, 'pro')
    assert.equal(current.subscription.source, 'payment')
    assert.equal(
      current.subscription.expiresAt,
      Date.parse(s.current_period_end_date),
    )
    const revision = current.subscription.revision
    await e.receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 1)
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now)).subscription.revision,
      revision,
    )
    await assert.rejects(createPaymentPortal(f.db, root, 3, 1, f.transport), {
      statusCode: 403,
    })
    assert.match(
      (await createPaymentPortal(f.db, root, 1, 1, f.transport)).url,
      /^https:\/\/creem.io\//,
    )
    await f.db
      .prepare(
        "INSERT INTO platform_payment_checkouts(id,workspace_id,user_id,request_id,plan_id,interval,product_id,price,currency,assignment_revision,state,created_at,updated_at) SELECT 'scope_checkout',2,2,'scope_request',plan_id,interval,product_id,price,currency,1,'completed',created_at,updated_at FROM platform_payment_checkouts LIMIT 1",
      )
      .run()
    await f.db
      .prepare(
        "INSERT INTO platform_payment_subscriptions(id,workspace_id,checkout_id,customer_id,product_id,plan_id,interval,quota_anchor,status,period_start,period_end,provider_updated_at,checked_at,next_check_at) SELECT 'sub_scope',2,'scope_checkout',customer_id,product_id,plan_id,interval,quota_anchor,'active',period_start,period_end,provider_updated_at,checked_at,next_check_at FROM platform_payment_subscriptions LIMIT 1",
      )
      .run()
    await assert.rejects(createPaymentPortal(f.db, root, 1, 1, f.transport), {
      code: 'payment_customer_scope_conflict',
    })
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Renewal, scheduled cancellation, stale webhook snapshots and immediate cancellation follow provider truth', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const s = await f.complete()
    await (
      await f.event('evt_start', 'checkout.completed', f.checkouts.get('chk_1'))
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    const anchor = (await resolveSubscription(f.db, 1, f.now)).subscription
      .startsAt
    s.current_period_end_date = new Date(f.now + 60 * 86400000).toISOString()
    s.updated_at = new Date(f.now + 1).toISOString()
    await (
      await f.event('evt_renew', 'subscription.paid', s, f.now + 1)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 1)
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now + 1)).subscription.startsAt,
      anchor,
    )
    s.status = 'scheduled_cancel'
    s.updated_at = new Date(f.now + 2).toISOString()
    await (
      await f.event(
        'evt_scheduled',
        'subscription.scheduled_cancel',
        s,
        f.now + 2,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 2)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 2)).id, 'pro')
    await (
      await f.event(
        'evt_old',
        'subscription.paused',
        { ...s, status: 'paused' },
        f.now,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 3)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 3)).id, 'pro')
    s.status = 'canceled'
    s.updated_at = new Date(f.now + 4).toISOString()
    await (
      await f.event('evt_cancel', 'subscription.canceled', s, f.now + 4)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 4)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 4)).id, 'free')
    s.status = 'unpaid'
    s.updated_at = new Date(f.now + 5).toISOString()
    await (
      await f.event('evt_unpaid', 'subscription.unpaid', s, f.now + 5)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 5)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 5)).id, 'free')
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT state FROM platform_payment_events WHERE id='evt_unpaid'",
          )
          .first<any>()
      ).state,
      'done',
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Ambiguous creates are not repeated; verified recovery and bounded retries restore the original checkout', async () => {
  const f = await fixture()
  try {
    f.setUncertain(true)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        f.input,
        'https://app.chronoframe.art',
        f.transport,
        f.now,
      ),
      { code: 'payment_confirmation_pending' },
    )
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        { ...f.input, requestId: 'another' },
        'https://app.chronoframe.art',
        f.transport,
        f.now,
      ),
      { code: 'payment_confirmation_pending' },
    )
    assert.equal(f.calls.filter((v) => v === 'POST /v1/checkouts').length, 1)
    const row = await f.db
      .prepare('SELECT id FROM platform_payment_checkouts')
      .first<any>()
    await f.complete()
    await recoverPaymentCheckout(
      f.db,
      root,
      row.id,
      'chk_1',
      f.transport,
      f.now,
    )
    f.setBroken(true)
    await processPaymentEvents(f.db, root, f.transport, f.now)
    const e = await f.db
      .prepare('SELECT * FROM platform_payment_events')
      .first<any>()
    assert.equal(e.state, 'pending')
    assert.equal(e.attempts, 1)
    assert.equal(e.available_at, f.now + 30000)
    const count = f.calls.length
    await processPaymentEvents(f.db, root, f.transport, f.now + 1)
    assert.equal(f.calls.length, count)
    f.setBroken(false)
    await processPaymentEvents(f.db, root, f.transport, f.now + 30001)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 30001)).id, 'pro')
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Manual grants supersede late renewals; expiry reconciliation can safely recover a renewed payment term', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const s = await f.complete()
    await (
      await f.event('evt_begin', 'checkout.completed', f.checkouts.get('chk_1'))
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    const originalAnchor = (await resolveSubscription(f.db, 1, f.now))
      .subscription.startsAt
    const expiry = Date.parse(s.current_period_end_date)
    await reconcileSubscriptions(f.db, expiry + 1)
    s.current_period_start_date = new Date(expiry).toISOString()
    s.current_period_end_date = new Date(expiry + 30 * 86400000).toISOString()
    s.updated_at = new Date(expiry + 1).toISOString()
    await (
      await f.event('evt_after_expiry', 'subscription.paid', s, expiry + 1)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, expiry + 1)
    assert.equal((await resolveSubscription(f.db, 1, expiry + 1)).id, 'pro')
    assert.equal(
      (await resolveSubscription(f.db, 1, expiry + 1)).subscription.startsAt,
      originalAnchor,
    )
    await f.db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='free',source='manual',revision=revision+1 WHERE workspace_id=1",
      )
      .run()
    await (
      await f.event('evt_late', 'subscription.paid', s, expiry + 2)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, expiry + 2)
    assert.equal((await resolveSubscription(f.db, 1, expiry + 2)).id, 'free')
    assert.equal(
      (
        await f.db
          .prepare('SELECT error FROM platform_payment_subscriptions')
          .first<any>()
      ).error,
      'payment_grant_superseded',
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Account cleanup waits for upstream cancellation; open expired sessions are reconciled from the provider', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const s = await f.complete()
    await (
      await f.event(
        'evt_cleanup',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    f.setBroken(true)
    await assert.rejects(closeAccountPayments(f.db, root, 1, f.transport))
    assert.equal(
      (
        await f.db
          .prepare('SELECT status FROM platform_payment_subscriptions')
          .first<any>()
      ).status,
      'active',
    )
    f.setBroken(false)
    assert.equal(await closeAccountPayments(f.db, root, 1, f.transport), true)
    assert.equal(s.status, 'canceled')
    await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...f.input, requestId: 'next' },
      'https://app.chronoframe.art',
      f.transport,
      f.now + 1,
    )
    f.checkouts.get('chk_2').status = 'expired'
    await reconcilePayments(f.db, root, f.transport, f.now + 60002)
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT state FROM platform_payment_checkouts WHERE provider_id='chk_2'",
          )
          .first<any>()
      ).state,
      'expired',
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Creem transport rejects redirects and live keys before any forwarded request', async () => {
  let calls = 0
  const transport = async (url: any, init: any) => {
    calls++
    assert.equal(new URL(url).origin, 'https://test-api.creem.io')
    assert.equal(init.redirect, 'manual')
    return new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example/' },
    })
  }
  await assert.rejects(
    creemRequest(
      credentials,
      '/v1/products/search',
      undefined,
      transport as typeof fetch,
    ),
    { code: 'payment_provider_request_failed' },
  )
  await assert.rejects(
    creemRequest(
      { ...credentials, apiKey: 'creem_live_fixture' },
      '/v1/products/search',
      undefined,
      transport as typeof fetch,
    ),
    { code: 'payment_test_mode_required' },
  )
  assert.equal(calls, 1)
})
// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('A single automatic trial-expiry transition does not suppress checkout; crashed inbox attempts stop at the budget', async () => {
  const f = await fixture()
  try {
    await f.db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='pro',source='promotion',expires_at=? WHERE workspace_id=1",
      )
      .bind(f.now + 1)
      .run()
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    await reconcileSubscriptions(f.db, f.now + 2)
    await f.complete()
    await (
      await f.event(
        'evt_trial_expiry',
        'checkout.completed',
        f.checkouts.get('chk_1'),
        f.now + 3,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 3)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 3)).id, 'pro')
    await f.db
      .prepare(
        "INSERT INTO platform_payment_events(id,type,object_id,created_at,available_at,attempts,lease_token,lease_until) VALUES('evt_crashed','subscription.paid','sub_crashed',?,?,8,'running',?)",
      )
      .bind(f.now, f.now, f.now + 1000)
      .run()
    const count = f.calls.length
    await processPaymentEvents(f.db, root, f.transport, f.now + 4)
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT state FROM platform_payment_events WHERE id='evt_crashed'",
          )
          .first<any>()
      ).state,
      'pending',
    )
    await processPaymentEvents(f.db, root, f.transport, f.now + 1001)
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT state FROM platform_payment_events WHERE id='evt_crashed'",
          )
          .first<any>()
      ).state,
      'failed',
    )
    assert.equal(f.calls.length, count)
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Definitive provider rejections release the checkout slot without repeating an uncertain create', async () => {
  const f = await fixture()
  try {
    f.setRejected(true)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        f.input,
        'https://app.chronoframe.art',
        f.transport,
        f.now,
      ),
      { code: 'payment_provider_request_failed' },
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT state FROM platform_payment_checkouts')
          .first<any>()
      ).state,
      'expired',
    )
    assert.equal(f.checkouts.size, 0)
    f.setRejected(false)
    await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...f.input, requestId: 'retry_after_key_repair' },
      'https://app.chronoframe.art',
      f.transport,
      f.now + 1,
    )
    assert.equal(f.checkouts.size, 1)
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Paid checkout snapshots survive price edits; actual purchasers qualify without borrowing another member subscription', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    await f.db
      .prepare("UPDATE platform_plans SET monthly_price=2400 WHERE id='pro'")
      .run()
    await f.complete()
    await (
      await f.event(
        'evt_saved_quote',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'pro')
    const localCheckout = await f.db
      .prepare('SELECT id FROM platform_payment_checkouts')
      .first<any>()
    await (
      await f.event('evt_refund_associated', 'refund.created', {
        id: 'refund_associated',
        mode: 'test',
        metadata: { chronoframe_checkout_id: localCheckout.id },
        customer: { email: 'owner@example.com' },
      })
    ).receive()
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_refund_associated', f.now))
        .available,
      true,
    )
    await f.db
      .prepare(
        "INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at) VALUES(4,'new-owner@example.com','New owner',1,?,?)",
      )
      .bind(f.now, f.now)
      .run()
    await f.db
      .prepare('UPDATE platform_workspaces SET owner_user_id=4 WHERE id=1')
      .run()
    assert.equal(
      await accountExemption(f.db, 1, DEFAULT_EXEMPTIONS, f.now),
      true,
    )
    assert.equal(
      await accountExemption(f.db, 3, DEFAULT_EXEMPTIONS, f.now),
      false,
    )
    await markAccount(
      f.db,
      1,
      'Requested account deletion',
      'admin',
      null,
      f.now,
    )
    await purgeAccounts(
      f.db,
      {
        billing: (id) => closeAccountPayments(f.db, root, id, f.transport),
        domains: async () => true,
        storage: async () => true,
      },
      f.now + 16 * 86400000,
    )
    assert.equal(
      await f.db.prepare('SELECT id FROM platform_users WHERE id=1').first(),
      null,
    )
    assert.ok(
      await f.db
        .prepare(
          'SELECT id FROM platform_workspaces WHERE id=1 AND owner_user_id=4',
        )
        .first(),
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT status FROM platform_payment_subscriptions')
          .first<any>()
      ).status,
      'canceled',
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT user_id FROM platform_payment_checkouts')
          .first<any>()
      ).user_id,
      null,
    )
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_saved_quote', f.now))
        .available,
      false,
    )
    assert.ok(
      await f.db
        .prepare(
          "SELECT id FROM platform_payment_events WHERE id='evt_saved_quote'",
        )
        .first(),
    )
    await (
      await f.event(
        'evt_saved_quote',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_saved_quote', f.now))
        .available,
      false,
    )
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_refund_associated', f.now))
        .available,
      false,
    )
    await (
      await f.event('evt_late_refund_associated', 'refund.created', {
        id: 'refund_late',
        mode: 'test',
        metadata: { chronoframe_checkout_id: localCheckout.id },
      })
    ).receive()
    assert.equal(
      (
        await paymentEventPayload(
          f.db,
          root,
          'evt_late_refund_associated',
          f.now,
        )
      ).available,
      false,
    )
    assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'free')
  } finally {
    await f.mf.dispose()
  }
})
// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Owned account erasure removes dependent payment rows only after cancellation succeeds', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    await f.complete()
    await (
      await f.event('evt_erase', 'checkout.completed', f.checkouts.get('chk_1'))
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    await markAccount(
      f.db,
      1,
      'Requested permanent cleanup',
      'admin',
      null,
      f.now,
    )
    await purgeAccounts(
      f.db,
      {
        billing: (id) => closeAccountPayments(f.db, root, id, f.transport),
        domains: async () => true,
        storage: async () => true,
      },
      f.now + 16 * 86400000,
    )
    assert.equal(
      await f.db.prepare('SELECT id FROM platform_users WHERE id=1').first(),
      null,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_subscriptions')
          .first<any>()
      ).n,
      0,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_checkouts')
          .first<any>()
      ).n,
      0,
    )
    await (
      await f.event(
        'evt_after_erasure',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 16 * 86400000)
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) n FROM platform_payment_event_payloads WHERE event_id='evt_after_erasure'",
          )
          .first<any>()
      ).n,
      0,
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Unchanged reconciliation does not churn grants, and an expiring activation preserves paid subscription recovery', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const sub = await f.complete()
    await (
      await f.event(
        'evt_initial_link',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    const before = await f.db
      .prepare(
        'SELECT revision FROM platform_workspace_plans WHERE workspace_id=1',
      )
      .first<any>()
    const count = await f.db
      .prepare('SELECT COUNT(*) n FROM platform_subscription_events')
      .first<any>()
    const subBefore = await f.db
      .prepare('SELECT revision FROM platform_payment_subscriptions')
      .first<any>()
    await reconcilePayments(f.db, root, f.transport, f.now + 1000000)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT revision FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).revision,
      before.revision,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM platform_subscription_events')
          .first<any>()
      ).n,
      count.n,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT revision FROM platform_payment_subscriptions')
          .first<any>()
      ).revision,
      subBefore.revision,
    )
    await f.db
      .prepare(
        "INSERT INTO platform_activation_codes(id,code_hash,display,batch_id,plan_id,duration_unit,duration_value,created_at,created_by) VALUES('temporary',?,'TEMP','batch','free','days',1,?,1)",
      )
      .bind(await activationHash('TEMPORARY'), f.now)
      .run()
    await redeemActivation(
      f.db,
      1,
      1,
      {
        code: 'TEMPORARY',
        requestId: crypto.randomUUID(),
        revision: before.revision,
      },
      f.now + 1000001,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT payment_subscription_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).payment_subscription_id,
      sub.id,
    )
    await (
      await f.event('evt_while_activation', 'subscription.paid', sub)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 1000002)
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now + 1000002)).subscription.source,
      'activation',
    )
    const expiry = (await resolveSubscription(f.db, 1, f.now + 1000002))
      .subscription.expiresAt!
    await reconcileSubscriptions(f.db, expiry + 1)
    await reconcilePayments(f.db, root, f.transport, expiry + 1)
    const restored = await resolveSubscription(f.db, 1, expiry + 1)
    assert.equal(restored.id, 'pro')
    assert.equal(restored.subscription.source, 'payment')
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('First past-due confirmation stores a real boundary without inventing a paid entitlement', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const sub = await f.complete()
    sub.status = 'past_due'
    await (
      await f.event(
        'evt_first_due',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'free')
    const stored = await f.db
      .prepare('SELECT period_end FROM platform_payment_subscriptions')
      .first<any>()
    assert.ok(
      stored.period_end > Date.UTC(2020, 0, 1) && stored.period_end <= f.now,
    )
    await reconcilePayments(f.db, root, f.transport, f.now + 120000)
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now + 120000)).id,
      'free',
    )
    sub.status = 'active'
    sub.updated_at = new Date(f.now + 120001).toISOString()
    await (
      await f.event('evt_due_paid', 'subscription.paid', sub, f.now + 120001)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 120001)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 120001)).id, 'pro')
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Ambiguous checkout diagnostics preserve safe causes and recoverable provider identifiers', async () => {
  for (const scenario of [
    'redirect',
    'mode',
    'request',
    'product',
    'metadata',
    'unbound',
    'timeout',
    'server',
    'invalid',
  ]) {
    const f = await fixture()
    try {
      const transport = async (url: any, init: any = {}) => {
        if (
          init.method !== 'POST' ||
          new URL(String(url)).pathname !== '/v1/checkouts'
        )
          return f.transport(url, init)
        if (scenario === 'timeout')
          throw new DOMException(
            'Sensitive provider key must never be persisted',
            'TimeoutError',
          )
        if (scenario === 'server')
          return new Response('Sensitive provider body', { status: 503 })
        const response = await f.transport(url, init),
          value = await response.json()
        if (scenario === 'redirect')
          value.checkout_url = 'https://foreign.example/private?secret=hidden'
        if (scenario === 'mode') value.mode = 'sandbox'
        if (scenario === 'request') value.request_id = 'wrong-request'
        if (scenario === 'product') value.product = 'wrong-product'
        if (scenario === 'metadata') {
          value.request_id = JSON.parse(init.body).request_id
          value.metadata = { chronoframe_checkout_id: 'wrong-checkout' }
        }
        if (scenario === 'unbound') delete value.metadata
        if (scenario === 'invalid') return Response.json(null)
        return Response.json(value)
      }
      await assert.rejects(
        createPaymentCheckout(
          f.db,
          root,
          1,
          f.input,
          'https://app.chronoframe.art',
          transport,
          f.now,
        ),
        { code: 'payment_confirmation_pending' },
      )
      const row = await f.db
        .prepare('SELECT * FROM platform_payment_checkouts')
        .first<any>()
      const codes = {
        redirect: 'payment_redirect_invalid',
        mode: 'payment_checkout_mode_sandbox',
        request: 'payment_checkout_request_invalid',
        product: 'payment_checkout_product_invalid',
        metadata: 'payment_checkout_request_invalid',
        unbound: 'payment_checkout_request_invalid',
        timeout: 'payment_provider_timeout',
        server: 'payment_provider_request_failed:503',
        invalid: 'payment_checkout_response_invalid',
      }
      assert.equal(row.error, codes[scenario as keyof typeof codes])
      assert.equal(row.state, 'uncertain')
      assert.equal(row.checkout_url, null)
      assert.equal(
        row.provider_id,
        ['timeout', 'server', 'invalid'].includes(scenario) ? null : 'chk_1',
      )
      assert.ok(!JSON.stringify(row).includes('Sensitive'))
      assert.ok(!JSON.stringify(row).includes('foreign.example'))
      if (row.provider_id) {
        await recoverPaymentCheckout(
          f.db,
          root,
          row.id,
          row.provider_id,
          f.transport,
          f.now + 1,
        )
        assert.equal(
          (
            await f.db
              .prepare('SELECT state FROM platform_payment_checkouts')
              .first<any>()
          ).state,
          'open',
        )
      }
      assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'free')
    } finally {
      await f.mf.dispose()
    }
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Abandoned sandbox attempts cannot grant access through late callbacks or block a fresh checkout', async () => {
  const f = await fixture()
  try {
    f.setUncertain(true)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        f.input,
        'https://app.chronoframe.art',
        f.transport,
        f.now,
      ),
    )
    await f.db
      .prepare(
        "UPDATE platform_payment_checkouts SET state='expired',error='payment_test_abandoned'",
      )
      .run()
    await f.complete()
    await (
      await f.event(
        'evt_abandoned',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'free')
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT state FROM platform_payment_events WHERE id='evt_abandoned'",
          )
          .first<any>()
      ).state,
      'ignored',
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM platform_payment_subscriptions')
          .first<any>()
      ).n,
      0,
    )
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_abandoned', f.now)).available,
      true,
    )
    await f.db
      .prepare('UPDATE platform_payment_checkouts SET user_id=NULL')
      .run()
    await (
      await f.event(
        'evt_abandoned_no_payer',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_abandoned_no_payer', f.now))
        .available,
      false,
    )
    f.setUncertain(false)
    const retry = await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...f.input, requestId: 'new_test_attempt' },
      'https://app.chronoframe.art',
      f.transport,
      f.now + 1,
    )
    assert.ok(retry.url)
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Checkout return reconciliation verifies provider truth and ownership without trusting the browser return', async () => {
  const f = await fixture()
  try {
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    assert.deepEqual(
      await refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        checkout.checkoutId,
        f.transport,
        f.now + 1,
      ),
      { state: 'pending' },
    )
    assert.equal((await resolveSubscription(f.db, 1, f.now + 1)).id, 'free')
    await assert.rejects(
      refreshPaymentCheckout(
        f.db,
        root,
        2,
        2,
        checkout.checkoutId,
        f.transport,
        f.now + 1,
      ),
      { statusCode: 404 },
    )
    await assert.rejects(
      refreshPaymentCheckout(
        f.db,
        root,
        3,
        1,
        checkout.checkoutId,
        f.transport,
        f.now + 1,
      ),
      { statusCode: 403 },
    )
    await f.complete()
    assert.deepEqual(
      await refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        checkout.checkoutId,
        f.transport,
        f.now + 2,
      ),
      { state: 'completed' },
    )
    assert.equal((await resolveSubscription(f.db, 1, f.now + 2)).id, 'pro')
    const revision = (await resolveSubscription(f.db, 1, f.now + 2))
      .assignment_revision
    const calls = f.calls.length
    await refreshPaymentCheckout(
      f.db,
      root,
      1,
      1,
      checkout.checkoutId,
      f.transport,
      f.now + 3,
    )
    assert.ok(f.calls.length > calls)
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now + 3)).assignment_revision,
      revision,
    )
    await (
      await f.event(
        'evt_delayed_return',
        'checkout.completed',
        f.checkouts.get('chk_1'),
        f.now + 4,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 4)
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now + 4)).assignment_revision,
      revision,
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Signed webhook payloads are encrypted, bound to their event, paginated and expired without losing the inbox', async () => {
  const f = await fixture()
  try {
    const association = await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    for (let i = 0; i < 56; i++)
      await (
        await f.event(
          'evt_page_' + String(i).padStart(3, '0'),
          'refund.created',
          {
            id: 'refund_' + i,
            mode: 'test',
            metadata: { chronoframe_checkout_id: association.checkoutId },
            customer: { email: 'private-customer@example.com' },
            note: i === 0 ? 'x'.repeat(50000) : 'original',
          },
        )
      ).receive()
    const first = await paymentEventPage(f.db),
      second = await paymentEventPage(f.db, first.nextCursor!),
      third = await paymentEventPage(f.db, second.nextCursor!)
    assert.equal(first.events.length, 25)
    assert.equal(second.events.length, 25)
    assert.equal(third.events.length, 6)
    assert.equal(third.nextCursor, null)
    assert.equal(
      new Set(
        [...first.events, ...second.events, ...third.events].map((r) => r.id),
      ).size,
      56,
    )
    await assert.rejects(paymentEventPage(f.db, 'invalid-cursor'), {
      statusCode: 400,
    })
    const payload = await paymentEventPayload(f.db, root, 'evt_page_000', f.now)
    assert.equal(
      payload.payload.object.customer.email,
      'private-customer@example.com',
    )
    assert.equal(payload.payload.object.note.length, 50000)
    const cipher = await f.db
      .prepare(
        "SELECT ciphertext FROM platform_payment_event_payloads WHERE event_id='evt_page_000'",
      )
      .first<any>()
    assert.ok(!cipher.ciphertext.includes('private-customer'))
    await assert.rejects(
      paymentEventPayload(
        f.db,
        'different-root-'.repeat(4),
        'evt_page_000',
        f.now,
      ),
      { statusCode: 503 },
    )
    await (
      await f.event('evt_page_000', 'refund.created', {
        id: 'refund_0',
        mode: 'test',
        note: 'duplicate',
      })
    ).receive()
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_page_000', f.now)).payload
        .object.note.length,
      50000,
    )
    assert.equal(
      (
        await paymentEventPayload(
          f.db,
          root,
          'evt_page_000',
          f.now + 31 * 86400000,
        )
      ).available,
      false,
    )
    await expirePaymentEventPayloads(f.db, f.now + 31 * 86400000)
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM platform_payment_event_payloads')
          .first<any>()
      ).n,
      0,
    )
    await (
      await f.event('evt_page_000', 'refund.created', {
        id: 'refund_0',
        mode: 'test',
      })
    ).receive()
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_page_000', f.now)).available,
      false,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) n FROM platform_payment_events')
          .first<any>()
      ).n,
      56,
    )
    await (
      await f.event('evt_unassociated_refund', 'refund.created', {
        id: 'refund_unknown',
        mode: 'test',
        customer: { email: 'unlinked@example.com' },
      })
    ).receive()
    assert.equal(
      (await paymentEventPayload(f.db, root, 'evt_unassociated_refund', f.now))
        .available,
      false,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT state FROM platform_payment_events WHERE id='evt_unassociated_refund'",
          )
          .first<any>()
      ).state,
      'ignored',
    )
  } finally {
    await f.mf.dispose()
  }
})

function productTransport(f: any) {
  const products = new Map<string, any>(),
    keys = new Map<string, string>(),
    calls: string[] = []
  let loseOnce = false,
    changeDuringCreate = false
  const transport = async (url: any, init: any = {}) => {
    const u = new URL(String(url)),
      method = init.method ?? 'GET'
    if (!u.pathname.startsWith('/v1/products')) return f.transport(url, init)
    calls.push(method + ' ' + u.pathname)
    if (method === 'POST') {
      const b = JSON.parse(init.body),
        key = init.headers['Idempotency-Key']
      assert.match(key, /^cfp_[a-f0-9]{64}$/)
      let id = keys.get(key)
      if (!id) {
        id = 'prod_auto_' + (products.size + 1)
        keys.set(key, id)
        products.set(id, { ...b, id, mode: 'test', status: 'active' })
      }
      if (changeDuringCreate) {
        changeDuringCreate = false
        await f.db
          .prepare(
            "UPDATE platform_plans SET monthly_price=1900,revision=revision+1 WHERE id='pro'",
          )
          .run()
      }
      if (loseOnce) {
        loseOnce = false
        throw new DOMException('Response lost after creation', 'TimeoutError')
      }
      return Response.json(products.get(id))
    }
    const id = u.searchParams.get('product_id') ?? u.pathname.split('/').at(-1)!
    if (method === 'PATCH') {
      assert.ok(!('price' in JSON.parse(init.body)))
      products.set(id, { ...products.get(id), ...JSON.parse(init.body) })
      return Response.json(products.get(id))
    }
    return products.has(id)
      ? Response.json(products.get(id))
      : Response.json({}, { status: 404 })
  }
  return {
    transport,
    products,
    calls,
    loseNext() {
      loseOnce = true
    },
    changeNext() {
      changeDuringCreate = true
    },
  }
}

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Automatic catalog sync publishes month/quarter products, updates rights and preserves existing billed prices', async () => {
  const f = await fixture(),
    p = productTransport(f)
  try {
    await f.db.prepare('DELETE FROM platform_payment_products').run()
    await f.db
      .prepare(
        'UPDATE platform_payment_settings SET auto_sync=1,revision=revision+1',
      )
      .run()
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 0)
    await syncPaymentProducts(f.db, root, p.transport, f.now, 20)
    assert.equal(p.products.size, 2)
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 2)
    const mapping = await f.db
      .prepare(
        "SELECT product_id FROM platform_payment_products WHERE plan_id='pro' AND interval=1",
      )
      .first<any>()
    const original = p.products.get(mapping.product_id)
    const originalPlan = await f.db
      .prepare("SELECT * FROM platform_plans WHERE id='pro'")
      .first<any>()
    assert.ok(original.description.includes('Platform storage'))
    assert.equal(original.billing_period, 'every-month')
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      p.transport,
      f.now,
    )
    const subscription = await f.complete()
    await (
      await f.event(
        'evt_auto_paid',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, p.transport, f.now)
    const policy = JSON.parse(
      (
        await f.db
          .prepare("SELECT policy_json FROM platform_plans WHERE id='pro'")
          .first<any>()
      ).policy_json,
    )
    policy.limits.storageBytes = 2 * 1024 ** 3
    await f.db
      .prepare(
        "UPDATE platform_plans SET name='Updated Pro',policy_json=?,revision=revision+1 WHERE id='pro'",
      )
      .bind(JSON.stringify(policy))
      .run()
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 0)
    await syncPaymentProducts(f.db, root, p.transport, f.now + 1, 20)
    assert.equal(p.products.size, 2)
    assert.ok(p.products.get(mapping.product_id).description.includes('2 GiB'))
    assert.ok(p.calls.some((c) => c.startsWith('PATCH')))
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_price=1500,revision=revision+1 WHERE id='pro'",
      )
      .run()
    await syncPaymentProducts(f.db, root, p.transport, f.now + 2, 20)
    assert.equal(p.products.size, 3)
    assert.equal(p.products.get(mapping.product_id).price, 1200)
    assert.notEqual(
      (
        await f.db
          .prepare(
            "SELECT product_id FROM platform_payment_products WHERE plan_id='pro' AND interval=1",
          )
          .first<any>()
      ).product_id,
      mapping.product_id,
    )
    subscription.updated_at = new Date(f.now + 3).toISOString()
    subscription.current_period_end_date = new Date(
      f.now + 60 * 86400000,
    ).toISOString()
    await (
      await f.event(
        'evt_old_price_renewal',
        'subscription.paid',
        subscription,
        f.now + 3,
      )
    ).receive()
    await processPaymentEvents(f.db, root, p.transport, f.now + 3)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 3)).id, 'pro')
    assert.equal(
      (
        await f.db
          .prepare('SELECT price FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.checkoutId)
          .first<any>()
      ).price,
      1200,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT product_id FROM platform_payment_subscriptions')
          .first<any>()
      ).product_id,
      mapping.product_id,
    )
    const calls = p.calls.length
    await syncPaymentProducts(f.db, root, p.transport, f.now + 4, 20)
    assert.equal(p.calls.length, calls)
    // Returning to an older quote may reuse a previously edited idempotent product.
    await f.db
      .prepare(
        "UPDATE platform_plans SET name=?,policy_json=?,monthly_price=1200,revision=revision+1 WHERE id='pro'",
      )
      .bind(originalPlan.name, originalPlan.policy_json)
      .run()
    await syncPaymentProducts(f.db, root, p.transport, f.now + 5, 20)
    const reverted = await f.db
      .prepare(
        "SELECT product_id FROM platform_payment_products WHERE plan_id='pro' AND interval=1",
      )
      .first<any>()
    assert.equal(reverted.product_id, mapping.product_id)
    assert.equal(
      p.products.get(reverted.product_id).description,
      original.description,
    )
    assert.equal(p.products.get(reverted.product_id).name, original.name)
    assert.ok(
      (await paymentProductSyncStatus(f.db))
        .filter((r) => r.plan_id === 'free')
        .every((r) => r.state === 'disabled'),
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Product creation retries are idempotent and a concurrent plan edit cannot publish an outdated product', async () => {
  for (const kind of ['timeout', 'edit']) {
    const f = await fixture(),
      p = productTransport(f)
    try {
      await f.db.prepare('DELETE FROM platform_payment_products').run()
      await f.db
        .prepare(
          'UPDATE platform_payment_settings SET auto_sync=1,revision=revision+1',
        )
        .run()
      if (kind === 'timeout') p.loseNext()
      else p.changeNext()
      await syncPaymentProducts(f.db, root, p.transport, f.now, 20)
      const month = await f.db
        .prepare(
          "SELECT * FROM platform_payment_products WHERE plan_id='pro' AND interval=1",
        )
        .first<any>()
      assert.equal(month, null)
      await syncPaymentProducts(f.db, root, p.transport, f.now + 120000, 20)
      const current = await f.db
        .prepare(
          "SELECT * FROM platform_payment_products WHERE plan_id='pro' AND interval=1",
        )
        .first<any>()
      assert.ok(current)
      assert.equal(current.price, kind === 'edit' ? 1900 : 1200)
      if (kind === 'timeout') assert.equal(p.products.size, 2)
      assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 2)
    } finally {
      await f.mf.dispose()
    }
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('An authoritative expired checkout return releases the pending checkout without waiting for cron', async () => {
  const f = await fixture()
  try {
    const first = await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    f.checkouts.get('chk_1').status = 'expired'
    assert.deepEqual(
      await refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        first.checkoutId,
        f.transport,
        f.now + 1,
      ),
      { state: 'expired' },
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT state FROM platform_payment_checkouts WHERE id=?')
          .bind(first.checkoutId)
          .first<any>()
      ).state,
      'expired',
    )
    const next = await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...f.input, requestId: 'after_expiry' },
      'https://app.chronoframe.art',
      f.transport,
      f.now + 2,
    )
    assert.ok(next.url)
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Customer portal resubscription keeps the canceled purchase and binds a new paid subscription', async () => {
  const f = await fixture()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const first = await f.complete()
    await (
      await f.event(
        'evt_portal_first',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    first.status = 'canceled'
    first.updated_at = new Date(f.now + 1000).toISOString()
    await (
      await f.event(
        'evt_portal_canceled',
        'subscription.canceled',
        first,
        f.now + 1000,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 1000)
    assert.equal((await resolveSubscription(f.db, 1, f.now + 1000)).id, 'free')
    const original = f.checkouts.get('chk_1'),
      metadata = {
        ...original.metadata,
        resubscribed_from_subscription_id: first.id,
      }
    const replacement = {
      ...first,
      id: 'sub_portal_replacement',
      status: 'active',
      metadata,
      current_period_start_date: new Date(f.now + 2000).toISOString(),
      current_period_end_date: new Date(f.now + 31 * 86400000).toISOString(),
      updated_at: new Date(f.now + 2000).toISOString(),
    }
    const checkout = {
      ...original,
      id: 'chk_portal_replacement',
      metadata,
      subscription: replacement.id,
    }
    f.checkouts.set(checkout.id, checkout)
    f.subscriptions.set(replacement.id, replacement)
    await (
      await f.event(
        'evt_portal_paid',
        'subscription.paid',
        replacement,
        f.now + 2000,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 2000)
    await (
      await f.event(
        'evt_portal_completed',
        'checkout.completed',
        checkout,
        f.now + 2001,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 2001)
    const errors = (
      await f.db
        .prepare(
          'SELECT type,error FROM platform_payment_events WHERE error IS NOT NULL',
        )
        .all<any>()
    ).results
    assert.equal(
      (await resolveSubscription(f.db, 1, f.now + 2001)).id,
      'pro',
      JSON.stringify(errors),
    )
    const rows = (
      await f.db
        .prepare(
          'SELECT id,checkout_id,status FROM platform_payment_subscriptions ORDER BY id',
        )
        .all<any>()
    ).results
    assert.equal(rows.length, 2)
    assert.notEqual(rows[0].checkout_id, rows[1].checkout_id)
    assert.equal(
      rows.find((row: any) => row.id === first.id).status,
      'canceled',
    )
    assert.equal(
      rows.find((row: any) => row.id === replacement.id).status,
      'active',
    )
  } finally {
    await f.mf.dispose()
  }
})

async function portalCase() {
  const f = await fixture()
  try {
    const local = await createPaymentCheckout(
      f.db,
      root,
      1,
      f.input,
      'https://app.chronoframe.art',
      f.transport,
      f.now,
    )
    const old = await f.complete()
    await (
      await f.event(
        'evt_base_paid',
        'checkout.completed',
        f.checkouts.get('chk_1'),
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now)
    old.status = 'canceled'
    old.updated_at = new Date(f.now + 1000).toISOString()
    await (
      await f.event(
        'evt_base_cancel',
        'subscription.canceled',
        old,
        f.now + 1000,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.now + 1000)
    const metadata = {
      ...old.metadata,
      resubscribed_from_subscription_id: old.id,
    }
    const subscription = {
      ...old,
      id: 'sub_repurchase',
      metadata,
      status: 'active',
      current_period_start_date: new Date(f.now + 2000).toISOString(),
      current_period_end_date: new Date(f.now + 31 * 86400000).toISOString(),
      updated_at: new Date(f.now + 2000).toISOString(),
    }
    const checkout = {
      ...f.checkouts.get('chk_1'),
      id: 'chk_repurchase',
      metadata,
      subscription: subscription.id,
    }
    f.subscriptions.set(subscription.id, subscription)
    f.checkouts.set(checkout.id, checkout)
    return { ...f, local, old, subscription, checkout, at: f.now + 2001 }
  } catch (error) {
    await f.mf.dispose()
    throw error
  }
}

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Portal return verifies the new checkout before webhooks and historical canceled returns stay inactive', async () => {
  const f = await portalCase()
  try {
    assert.deepEqual(
      await refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        f.local.checkoutId,
        f.transport,
        f.at,
      ),
      { state: 'inactive' },
    )
    assert.deepEqual(
      await refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        f.local.checkoutId,
        f.transport,
        f.at,
        {
          providerCheckoutId: f.checkout.id,
          subscriptionId: f.subscription.id,
        },
      ),
      { state: 'completed' },
    )
    assert.equal((await resolveSubscription(f.db, 1, f.at)).id, 'pro')
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT provider_id FROM platform_payment_checkouts WHERE id=?',
          )
          .bind(f.local.checkoutId)
          .first<any>()
      ).provider_id,
      'chk_1',
    )
    await assert.rejects(
      refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        f.local.checkoutId,
        f.transport,
        f.at,
        { providerCheckoutId: f.checkout.id, subscriptionId: 'sub_wrong' },
      ),
      { code: 'payment_binding_invalid' },
    )
    await assert.rejects(
      refreshPaymentCheckout(
        f.db,
        root,
        2,
        1,
        f.local.checkoutId,
        f.transport,
        f.at,
        { providerCheckoutId: f.checkout.id },
      ),
      { statusCode: 403 },
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Portal replay and late predecessor cancellation cannot downgrade the replacement or duplicate grants', async () => {
  for (const paidFirst of [true, false]) {
    const f = await portalCase()
    try {
      const paid = await f.event(
          'evt_new_paid',
          'subscription.paid',
          f.subscription,
          f.at,
        ),
        completed = await f.event(
          'evt_new_checkout',
          'checkout.completed',
          f.checkout,
          f.at,
        )
      await (paidFirst ? paid : completed).receive()
      await processPaymentEvents(f.db, root, f.transport, f.at)
      if (paidFirst)
        assert.equal(
          (
            await f.db
              .prepare(
                "SELECT error FROM platform_payment_events WHERE id='evt_new_paid'",
              )
              .first<any>()
          ).error,
          'payment_confirmation_pending',
        )
      await (paidFirst ? completed : paid).receive()
      await processPaymentEvents(f.db, root, f.transport, f.at + 1)
      await processPaymentEvents(f.db, root, f.transport, f.at + 31000)
      const before = await resolveSubscription(f.db, 1, f.at + 31000)
      assert.equal(before.id, 'pro')
      const revision = before.subscription.revision
      await completed.receive()
      await paid.receive()
      f.old.updated_at = new Date(f.at + 32000).toISOString()
      await (
        await f.event(
          'evt_old_cancel_late',
          'subscription.canceled',
          f.old,
          f.at + 32000,
        )
      ).receive()
      await (
        await f.event(
          'evt_new_paid_duplicate',
          'subscription.paid',
          f.subscription,
          f.at + 32000,
        )
      ).receive()
      await Promise.all([
        processPaymentEvents(f.db, root, f.transport, f.at + 32000),
        processPaymentEvents(f.db, root, f.transport, f.at + 32000),
      ])
      await processPaymentEvents(f.db, root, f.transport, f.at + 100000)
      const after = await resolveSubscription(f.db, 1, f.at + 100000)
      assert.equal(after.id, 'pro')
      assert.equal(after.subscription.revision, revision)
      assert.equal(
        (
          await f.db
            .prepare('SELECT COUNT(*) AS n FROM platform_payment_checkouts')
            .first<any>()
        ).n,
        2,
      )
      assert.equal(
        (
          await f.db
            .prepare('SELECT COUNT(*) AS n FROM platform_payment_subscriptions')
            .first<any>()
        ).n,
        2,
      )
    } finally {
      await f.mf.dispose()
    }
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Portal lineage rejects foreign customers, conflicting metadata, active predecessors and unavailable products', async () => {
  for (const scenario of [
    'customer',
    'marker',
    'origin',
    'predecessor',
    'active',
    'disabled',
    'unlisted',
    'member',
    'future',
    'request',
  ]) {
    const f = await portalCase()
    try {
      if (scenario === 'customer') {
        f.checkout.customer = { id: 'cust_other' }
        f.subscription.customer = { id: 'cust_other' }
      }
      if (scenario === 'marker')
        f.subscription.metadata = {
          ...f.subscription.metadata,
          resubscribed_from_subscription_id: 'sub_other',
        }
      if (scenario === 'origin')
        f.subscription.metadata = {
          ...f.subscription.metadata,
          chronoframe_checkout_id: 'other_origin',
        }
      if (scenario === 'predecessor') {
        f.checkout.metadata = {
          ...f.checkout.metadata,
          resubscribed_from_subscription_id: 'sub_missing',
        }
        f.subscription.metadata = f.checkout.metadata
      }
      if (scenario === 'active') f.old.status = 'active'
      if (scenario === 'disabled')
        await f.db
          .prepare('UPDATE platform_payment_products SET enabled=0')
          .run()
      if (scenario === 'unlisted')
        await f.db
          .prepare("UPDATE platform_plans SET listed=0 WHERE id='pro'")
          .run()
      if (scenario === 'member')
        await f.db
          .prepare(
            "UPDATE platform_memberships SET role='member' WHERE workspace_id=1 AND user_id=1",
          )
          .run()
      if (scenario === 'future')
        f.subscription.current_period_start_date = new Date(
          f.at + 86400000,
        ).toISOString()
      if (scenario === 'request')
        f.checkout.request_id = 'contradicting_request'
      await (
        await f.event('evt_bad_portal', 'checkout.completed', f.checkout, f.at)
      ).receive()
      await processPaymentEvents(f.db, root, f.transport, f.at)
      assert.equal(
        (await resolveSubscription(f.db, 1, f.at)).id,
        'free',
        scenario,
      )
      assert.equal(
        (
          await f.db
            .prepare('SELECT COUNT(*) AS n FROM platform_payment_subscriptions')
            .first<any>()
        ).n,
        1,
        scenario,
      )
      assert.equal(
        (
          await f.db
            .prepare('SELECT COUNT(*) AS n FROM platform_payment_checkouts')
            .first<any>()
        ).n,
        1,
        scenario,
      )
      const event = await f.db
        .prepare(
          "SELECT state,error FROM platform_payment_events WHERE id='evt_bad_portal'",
        )
        .first<any>()
      assert.ok(event.error || event.state === 'ignored', scenario)
    } finally {
      await f.mf.dispose()
    }
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Portal replacement records payment without overriding a later manual grant', async () => {
  const f = await portalCase()
  try {
    await f.db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='free',source='manual',payment_subscription_id=NULL,revision=revision+1 WHERE workspace_id=1",
      )
      .run()
    assert.deepEqual(
      await refreshPaymentCheckout(
        f.db,
        root,
        1,
        1,
        f.local.checkoutId,
        f.transport,
        f.at,
        {
          providerCheckoutId: f.checkout.id,
          subscriptionId: f.subscription.id,
        },
      ),
      { state: 'superseded' },
    )
    const current = await resolveSubscription(f.db, 1, f.at)
    assert.equal(current.id, 'free')
    assert.equal(current.subscription.source, 'manual')
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT error FROM platform_payment_subscriptions WHERE id=?',
          )
          .bind(f.subscription.id)
          .first<any>()
      ).error,
      'payment_grant_superseded',
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Portal subscription chains preserve origin history and remain removable by account erasure', async () => {
  const f = await portalCase()
  try {
    await (
      await f.event('evt_chain_first', 'checkout.completed', f.checkout, f.at)
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.at)
    f.subscription.status = 'canceled'
    f.subscription.updated_at = new Date(f.at + 1000).toISOString()
    await (
      await f.event(
        'evt_chain_cancel',
        'subscription.canceled',
        f.subscription,
        f.at + 1000,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.at + 1000)
    const metadata = {
      ...f.checkout.metadata,
      resubscribed_from_subscription_id: f.subscription.id,
    }
    const next = {
      ...f.subscription,
      id: 'sub_repurchase_again',
      status: 'active',
      metadata,
      updated_at: new Date(f.at + 2000).toISOString(),
    }
    const checkout = {
      ...f.checkout,
      id: 'chk_repurchase_again',
      metadata,
      subscription: next.id,
    }
    f.subscriptions.set(next.id, next)
    f.checkouts.set(checkout.id, checkout)
    await (
      await f.event(
        'evt_chain_second',
        'checkout.completed',
        checkout,
        f.at + 2000,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.at + 2000)
    assert.equal((await resolveSubscription(f.db, 1, f.at + 2000)).id, 'pro')
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_subscriptions')
          .first<any>()
      ).n,
      3,
    )
    await markAccount(
      f.db,
      1,
      'Requested account erasure',
      'admin',
      null,
      f.at + 3000,
    )
    await purgeAccounts(
      f.db,
      {
        billing: (id) => closeAccountPayments(f.db, root, id, f.transport),
        domains: async () => true,
        storage: async () => true,
      },
      f.at + 16 * 86400000,
    )
    assert.equal(
      await f.db.prepare('SELECT id FROM platform_users WHERE id=1').first(),
      null,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_payment_checkouts WHERE workspace_id=1',
          )
          .first<any>()
      ).n,
      0,
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('A late portal repurchase cannot replace a newer independently purchased subscription', async () => {
  const f = await portalCase()
  try {
    await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...f.input, requestId: 'client_new_purchase' },
      'https://app.chronoframe.art',
      f.transport,
      f.at,
    )
    const newer = await f.complete('chk_3')
    newer.current_period_start_date = new Date(f.at).toISOString()
    newer.updated_at = new Date(f.at).toISOString()
    await (
      await f.event(
        'evt_newer_independent',
        'checkout.completed',
        f.checkouts.get('chk_3'),
        f.at,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.at)
    await (
      await f.event(
        'evt_late_portal',
        'checkout.completed',
        f.checkout,
        f.at + 1,
      )
    ).receive()
    await processPaymentEvents(f.db, root, f.transport, f.at + 1)
    const assignment = await f.db
      .prepare(
        'SELECT payment_subscription_id FROM platform_workspace_plans WHERE workspace_id=1',
      )
      .first<any>()
    assert.equal(assignment.payment_subscription_id, newer.id)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT error FROM platform_payment_subscriptions WHERE id=?',
          )
          .bind(f.subscription.id)
          .first<any>()
      ).error,
      'payment_grant_superseded',
    )
  } finally {
    await f.mf.dispose()
  }
})

// Historical Creem sandbox coverage; retired in favor of payment-providers.test.ts.
test.skip('Disabled payments and activation-code mode expose redemption and reject checkout without contacting a provider', async () => {
  const f = await fixture()
  try {
    for (const [enabled, method, effective] of [
      [0, 'payment', 'activation_code'],
      [1, 'activation_code', 'activation_code'],
      [1, 'payment', 'payment'],
    ] as const) {
      await f.db
        .prepare(
          'UPDATE platform_payment_settings SET enabled=?,purchase_method=? WHERE id=1',
        )
        .bind(enabled, method)
        .run()
      const catalog = await pricingCatalog(f.db)
      assert.equal(catalog.purchaseMethod, effective)
      const status = await paymentStatus(f.db, 1, 1)
      assert.equal(status.purchaseMethod, effective)
      if (effective === 'activation_code') {
        assert.equal(status.offers.length, 0)
        const count = f.calls.length
        await assert.rejects(
          createPaymentCheckout(
            f.db,
            root,
            1,
            f.input,
            'https://app.chronoframe.art',
            f.transport,
          ),
          { code: 'payment_checkout_disabled' },
        )
        assert.equal(f.calls.length, count)
      } else assert.equal(status.offers.length, 2)
    }
  } finally {
    await f.mf.dispose()
  }
})
