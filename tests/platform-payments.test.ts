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
      .split(';')
      .filter((s) => s.trim()))
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
      "UPDATE platform_payment_settings SET enabled=1,workspace_ids_json='[1]',credentials_ciphertext=?",
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
        request_id: b.request_id,
        product: b.product_id,
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

test('Payment credentials are authenticated-encrypted, test-only, workspace-admin scoped and price checked', async () => {
  const f = await fixture()
  try {
    const stored = await f.db
      .prepare('SELECT credentials_ciphertext FROM platform_payment_settings')
      .first<any>()
    assert.ok(!stored.credentials_ciphertext.includes(credentials.apiKey))
    assert.deepEqual(await paymentSecrets(f.db, root), credentials)
    await assert.rejects(paymentSecrets(f.db, 'different-root-key-'.repeat(4)))
    assert.deepEqual((await paymentSettings(f.db)).workspaceIds, [1])
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
    await f.db
      .prepare("UPDATE platform_payment_settings SET workspace_ids_json='[]'")
      .run()
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

test('Concurrent checkout creation, raw signatures, durable deduplication and authoritative grants', async () => {
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

test('Renewal, scheduled cancellation, stale webhook snapshots and immediate cancellation follow provider truth', async () => {
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

test('Ambiguous creates are not repeated; verified recovery and bounded retries restore the original checkout', async () => {
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

test('Manual grants supersede late renewals; expiry reconciliation can safely recover a renewed payment term', async () => {
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
        "UPDATE platform_workspace_plans SET plan_id='free',source='manual',payment_subscription_id=NULL,revision=revision+1 WHERE workspace_id=1",
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

test('Account cleanup waits for upstream cancellation; open expired sessions are reconciled from the provider', async () => {
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

test('Creem transport rejects redirects and live keys before any forwarded request', async () => {
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
test('A single automatic trial-expiry transition does not suppress checkout; crashed inbox attempts stop at the budget', async () => {
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

test('Definitive provider rejections release the checkout slot without repeating an uncertain create', async () => {
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

test('Paid checkout snapshots survive price edits; actual purchasers qualify without borrowing another member subscription', async () => {
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
    assert.equal((await resolveSubscription(f.db, 1, f.now)).id, 'free')
  } finally {
    await f.mf.dispose()
  }
})
test('Owned account erasure removes dependent payment rows only after cancellation succeeds', async () => {
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
  } finally {
    await f.mf.dispose()
  }
})
