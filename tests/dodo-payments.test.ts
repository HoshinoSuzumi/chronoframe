import test from 'node:test'
import { discountedPrice } from '../packages/contracts/src/pricing.ts'
import {
  validatePricing,
  pricingCatalog,
} from '../packages/platform/src/billing.ts'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  savePaymentProvider,
  selectPaymentProvider,
  paymentProviders,
} from '../packages/platform/src/payment-providers.ts'
import {
  paymentSettings,
  paymentStatus,
  createPaymentCheckout,
  closeAccountPayments,
} from '../packages/platform/src/payments.ts'
import {
  syncDodoProducts,
  receiveDodoEvent,
  processDodoEvents,
  refreshDodoCheckout,
  reconcileDodoPayments,
} from '../packages/platform/src/dodo-payments.ts'
import { dodoClient, dodoURL } from '../packages/platform/src/dodo-client.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
const root = 'local-dodo-payment-root-key-'.repeat(3),
  webhookSecret = 'whsec_' + btoa('test-webhook-signing-key-32-bytes!')
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
    .sort())
    for (const sql of (
      await readFile(
        new URL('../packages/platform/migrations/' + file, import.meta.url),
        'utf8',
      )
    )
      .replace(/^--.*$/gm, '')
      .match(/\s*CREATE TRIGGER[\s\S]+?END;|[^;]+;/g) ?? [])
      await db.prepare(sql).run()
  await db
    .prepare(
      'CREATE TABLE platform_admin_audit(id TEXT PRIMARY KEY,actor_id INTEGER,action TEXT,target TEXT,reason TEXT,after_json TEXT,created_at INTEGER)',
    )
    .run()
  await db
    .prepare(
      "INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at) VALUES(1,'owner@example.com','Owner',1,?,?),(2,'other@example.com','Other',1,?,?)",
    )
    .bind(now, now, now, now)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_workspaces(id,name,owner_user_id,created_at) VALUES(1,'First',1,?),(2,'Second',2,?)",
    )
    .bind(now, now)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_memberships(workspace_id,user_id,role) VALUES(1,1,'admin'),(2,2,'admin'),(1,2,'member')",
    )
    .run()
  await db
    .prepare(
      "INSERT INTO platform_workspace_plans(workspace_id,plan_id,starts_at,source) VALUES(1,'free',?,'default'),(2,'free',?,'default')",
    )
    .bind(now, now)
    .run()
  await db
    .prepare(
      "INSERT INTO platform_plans(id,name,policy_json,currency,monthly_price,quarterly_price) SELECT 'pro','Pro',policy_json,'USD',1200,3000 FROM platform_plans WHERE id='free'",
    )
    .run()
  for (const environment of ['test', 'live'])
    await savePaymentProvider(db, root, 1, {
      id: 'dodo_' + environment,
      name: 'Dodo ' + environment,
      provider: 'dodo',
      environment,
      revision: 0,
      reason: 'Set up Dodo credentials',
      credentials: {
        apiKey: 'api_' + environment,
        webhookSecret:
          environment === 'test'
            ? webhookSecret
            : 'whsec_' + btoa('production-webhook-signing-key-32'),
      },
    })
  await db
    .prepare(
      "UPDATE platform_payment_settings SET enabled=1,current_provider='dodo_test'",
    )
    .run()
  const calls: any[] = [],
    products = new Map<string, any>(),
    sessions = new Map<string, any>(),
    payments = new Map<string, any>(),
    subscriptions = new Map<string, any>()
  let createUncertain = false
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ),
      body = init?.body ? JSON.parse(String(init.body)) : undefined
    const environment =
      url.hostname === 'test.dodopayments.com' ? 'test' : 'live'
    assert.ok(
      ['test.dodopayments.com', 'live.dodopayments.com'].includes(url.hostname),
    )
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer api_' + environment,
    )
    calls.push({ url: url.href, body, method: init?.method })
    if (url.pathname === '/products' && init?.method === 'POST') {
      const product = {
        ...body,
        product_id: 'pdt_' + environment + '_' + products.size,
        is_recurring: true,
      }
      products.set(product.product_id, product)
      return Response.json(product)
    }
    if (url.pathname.startsWith('/products/'))
      return Response.json(products.get(url.pathname.split('/')[2]!))
    if (url.pathname === '/checkouts' && init?.method === 'POST') {
      if (createUncertain) throw Error('provider raw secret')
      const id = 'cks_' + environment + '_' + sessions.size
      sessions.set(id, {
        id,
        metadata: body.metadata,
        product_id: body.product_cart[0].product_id,
        payment_id: null,
        payment_status: null,
      })
      return Response.json({
        session_id: id,
        checkout_url: `https://${environment === 'test' ? 'test.' : ''}checkout.dodopayments.com/session/${id}`,
      })
    }
    if (url.pathname.startsWith('/checkouts/'))
      return Response.json(sessions.get(url.pathname.split('/')[2]!))
    if (url.pathname.startsWith('/subscriptions/'))
      return Response.json(subscriptions.get(url.pathname.split('/')[2]!))
    if (url.pathname === '/payments')
      return Response.json({ items: [...payments.values()] })
    if (url.pathname.startsWith('/payments/'))
      return Response.json(payments.get(url.pathname.split('/')[2]!))
    throw Error('Unexpected request ' + url.href)
  }
  async function paid(checkout: any, months = 1) {
    const id = checkout.url.split('/').pop()!,
      session = sessions.get(id),
      product = products.get(session.product_id),
      start = new Date(now - 1000).toISOString(),
      end = new Date(now + months * 28 * 86400000).toISOString()
    const sub = {
      subscription_id: 'sub_' + id,
      product_id: product.product_id,
      currency: 'USD',
      customer: { customer_id: 'cus_owner' },
      metadata: session.metadata,
      status: 'active',
      quantity: 1,
      payment_frequency_interval: 'Month',
      payment_frequency_count: months,
      on_demand: false,
      trial_period_days: 0,
      previous_billing_date: start,
      next_billing_date: end,
      cancel_at_next_billing_date: false,
    }
    const payment = {
      payment_id: 'pay_' + id,
      status: 'succeeded',
      total_amount: discountedPrice(
        product.price.price,
        product.price.discount_bps ?? 0,
      ),
      currency: 'USD',
      customer: sub.customer,
      metadata: session.metadata,
      subscription_id: sub.subscription_id,
      subscription_ids: [sub.subscription_id],
      service_periods: [
        {
          subscription_id: sub.subscription_id,
          starts_at: start,
          ends_at: end,
        },
      ],
      refunds: [],
      disputes: [],
      created_at: start,
      is_multi_subscription: false,
      is_update_payment_method: false,
    }
    subscriptions.set(sub.subscription_id, sub)
    payments.set(payment.payment_id, payment)
    session.payment_id = payment.payment_id
    session.payment_status = 'succeeded'
    return { sub, payment, session }
  }
  async function select(environment: string) {
    const settings = await paymentSettings(db)
    await selectPaymentProvider(db, 1, {
      id: 'dodo_' + environment,
      revision: settings.revision,
      reason: 'Switch Dodo environment',
    })
  }
  async function sign(type: string, data: any, eventId = 'evt_local') {
    const body = JSON.stringify({
        type,
        data,
        timestamp: new Date().toISOString(),
        business_id: 'bus_fixture',
      }),
      ts = String(Math.floor(Date.now() / 1000))
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(atob(webhookSecret.slice(6))),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(eventId + '.' + ts + '.' + body),
    )
    return {
      body: new TextEncoder().encode(body),
      headers: {
        'webhook-id': eventId,
        'webhook-timestamp': ts,
        'webhook-signature':
          'v1,' + btoa(String.fromCharCode(...new Uint8Array(sig))),
      },
    }
  }
  return {
    mf,
    db,
    now,
    calls,
    transport,
    products,
    sessions,
    payments,
    subscriptions,
    paid,
    select,
    sign,
    uncertain: () => {
      createUncertain = true
    },
  }
}
const input = (requestId = 'request_checkout') => ({
  workspaceId: 1,
  planId: 'pro',
  interval: 1,
  requestId,
})
test('official SDK isolates environments, synchronizes prices and creates a signed-webhook fulfilled checkout', async () => {
  const f = await fixture()
  try {
    assert.equal((await paymentSettings(f.db)).providerAvailable, true)
    assert.equal((await syncDodoProducts(f.db, root, f.transport)).processed, 2)
    assert.equal((await syncDodoProducts(f.db, root, f.transport)).processed, 0)
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 2)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    assert.match(checkout.url, /test\.checkout\.dodopayments/)
    assert.deepEqual(
      await createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        'https://portal.example',
        f.transport,
      ),
      checkout,
    )
    const { sub, payment } = await f.paid(checkout)
    const event = await f.sign('payment.succeeded', payment)
    await assert.rejects(
      receiveDodoEvent(
        f.db,
        root,
        'test',
        event.body,
        { ...event.headers, 'webhook-signature': 'v1,bad' },
        f.transport,
      ),
      { code: 'payment_signature_invalid' },
    )
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_payment_events WHERE provider='dodo'",
          )
          .first<any>()
      ).n,
      1,
    )
    const stored = await f.db
      .prepare('SELECT ciphertext FROM platform_payment_event_payloads')
      .first<any>()
    assert.ok(!stored.ciphertext.includes('cus_owner'))
    await processDodoEvents(f.db, root, f.transport)
    const grant = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.equal(grant.plan_id, 'pro')
    assert.equal(
      grant.payment_subscription_id,
      'dodo:dodo_test:' + sub.subscription_id,
    )
    const events = (
      await f.db
        .prepare('SELECT COUNT(*) AS n FROM platform_subscription_events')
        .first<any>()
    ).n
    await reconcileDodoPayments(f.db, root, f.transport, f.now + 400000)
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_subscription_events')
          .first<any>()
      ).n,
      events,
    )
    await f.select('live')
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 0)
    await assert.rejects(
      receiveDodoEvent(
        f.db,
        root,
        'test',
        event.body,
        event.headers,
        f.transport,
      ),
      { code: 'payment_unavailable' },
    )
    await syncDodoProducts(f.db, root, f.transport)
    assert.ok(
      f.calls.some(
        (c) => new URL(c.url).origin === 'https://live.dodopayments.com',
      ),
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_dodo_products')
          .first<any>()
      ).n,
      4,
    )
    assert.equal(
      (await paymentProviders(f.db)).filter((p) => p.available).length,
      2,
    )
  } finally {
    await f.mf.dispose()
  }
})
test('Dodo switch, purchase mode, membership and mid-flight shutdown prevent provider calls or grants', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        2,
        input(),
        'https://portal.example',
        f.transport,
      ),
      { code: 'workspace_admin_required' },
    )
    await f.db
      .prepare(
        "UPDATE platform_payment_settings SET purchase_method='activation_code'",
      )
      .run()
    let before = f.calls.length
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        'https://portal.example',
        f.transport,
      ),
      { code: 'payment_unavailable' },
    )
    assert.equal(f.calls.length, before)
    await f.db
      .prepare("UPDATE platform_payment_settings SET purchase_method='payment'")
      .run()
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { payment } = await f.paid(checkout),
      event = await f.sign('payment.succeeded', payment)
    const { client } = await dodoClient(f.db, root, 'test', f.transport)
    await f.db.prepare('UPDATE platform_payment_settings SET enabled=0').run()
    before = f.calls.length
    await syncDodoProducts(f.db, root, f.transport)
    await reconcileDodoPayments(f.db, root, f.transport)
    await processDodoEvents(f.db, root, f.transport)
    await assert.rejects(
      receiveDodoEvent(
        f.db,
        root,
        'test',
        event.body,
        event.headers,
        f.transport,
      ),
      { code: 'payment_unavailable' },
    )
    await assert.rejects(client.products.list())
    assert.equal(f.calls.length, before)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'free',
    )
    assert.throws(
      () => dodoURL('https://test.checkout.dodopayments.com/session/x', 'live'),
      { code: 'payment_redirect_invalid' },
    )
    await assert.rejects(
      savePaymentProvider(f.db, root, 1, {
        id: 'dodo_test',
        name: 'Dodo',
        environment: 'live',
        revision: 1,
        reason: 'Invalid environment change',
      }),
      { code: 'payment_environment_invalid' },
    )
  } finally {
    await f.mf.dispose()
  }
})
test('authoritative returns, renewals, cancellation and superseding grants never trust browser identifiers', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    await assert.rejects(
      refreshDodoCheckout(f.db, root, 2, 1, checkout.id, f.transport),
      { code: 'workspace_admin_required' },
    )
    const { sub, payment } = await f.paid(checkout)
    assert.equal(
      (await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport))
        .state,
      'completed',
    )
    const first = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    const renewed = {
      ...payment,
      payment_id: 'pay_renewed',
      metadata: {},
      created_at: new Date(f.now + 1000).toISOString(),
      service_periods: [
        {
          subscription_id: sub.subscription_id,
          starts_at: payment.service_periods[0].ends_at,
          ends_at: new Date(f.now + 56 * 86400000).toISOString(),
        },
      ],
    }
    f.payments.set(renewed.payment_id, renewed)
    let event = await f.sign('payment.succeeded', renewed, 'evt_renewal')
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await processDodoEvents(f.db, root, f.transport, f.now + 28 * 86400000)
    const renewal = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.ok(renewal.expires_at > first.expires_at)
    assert.equal(renewal.starts_at, first.starts_at)
    await f.db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='free',source='manual',revision=revision+1 WHERE workspace_id=1",
      )
      .run()
    sub.status = 'cancelled'
    event = await f.sign('subscription.cancelled', sub, 'evt_cancelled')
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await processDodoEvents(f.db, root, f.transport)
    const manual = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.equal(manual.source, 'manual')
    assert.equal(manual.plan_id, 'free')
  } finally {
    await f.mf.dispose()
  }
})
test('ambiguous SDK checkout creation is never repeated; stale catalog snapshots cannot create a session', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_price=1300,name='Pro Updated',description='Updated entitlements',revision=revision+1 WHERE id='pro'",
      )
      .run()
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        'https://portal.example',
        f.transport,
      ),
      { code: 'payment_plan_unavailable' },
    )
    await syncDodoProducts(f.db, root, f.transport)
    assert.ok(
      [...f.products.values()].some(
        (p) =>
          p.name.includes('Pro Updated') &&
          p.description.includes('Updated entitlements') &&
          p.price.price === 1300,
      ),
    )
    assert.ok([...f.products.values()].some((p) => p.price.price === 1200))
    f.uncertain()
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        'https://portal.example',
        f.transport,
      ),
      { code: 'payment_confirmation_pending' },
    )
    const before = f.calls.length
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        'https://portal.example',
        f.transport,
      ),
      { code: 'payment_confirmation_pending' },
    )
    assert.equal(f.calls.length, before)
  } finally {
    await f.mf.dispose()
  }
})

test('wrong amounts cannot grant access and authoritative refunds revoke only the linked paid grant', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    assert.match([...f.products.values()][0].description, /Platform storage:/)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { payment } = await f.paid(checkout)
    const amount = payment.total_amount
    payment.total_amount = 1
    await assert.rejects(
      refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport),
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'free',
    )
    payment.total_amount = amount
    await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'pro',
    )
    payment.refunds.push({ status: 'succeeded' } as never)
    const event = await f.sign(
      'refund.succeeded',
      { payment_id: payment.payment_id },
      'evt_refund',
    )
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await processDodoEvents(f.db, root, f.transport)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT source FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).source,
      'expired_default',
    )
  } finally {
    await f.mf.dispose()
  }
})

test('default discounts use basis points in Dodo, public pricing and the immutable checkout amount', async () => {
  const f = await fixture()
  try {
    const pricing = validatePricing({
      currency: 'USD',
      monthlyPrice: 1200,
      quarterlyPrice: 3000,
      monthlyDiscountBps: 2000,
      quarterlyDiscountBps: 1000,
      listed: true,
      description: 'Discounted Pro',
      sortOrder: 1,
    })
    assert.equal(pricing.monthlyDiscountBps, 2000)
    assert.throws(
      () => validatePricing({ ...pricing, monthlyDiscountBps: 10000 }),
      { code: 'invalid_pricing' },
    )
    assert.throws(
      () => validatePricing({ ...pricing, monthlyDiscountBps: 0.5 }),
      { code: 'invalid_pricing' },
    )
    assert.equal(discountedPrice(2399, 1000), 2159)
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_discount_bps=2000,quarterly_discount_bps=1000,revision=revision+1 WHERE id='pro'",
      )
      .run()
    await syncDodoProducts(f.db, root, f.transport)
    const product = [...f.products.values()].find(
      (p) => p.price.payment_frequency_count === 1,
    )
    assert.equal(product.price.price, 1200)
    assert.equal(product.price.discount_bps, 2000)
    const catalog = await pricingCatalog(f.db),
      plan = catalog.plans.find((p) => p.id === 'pro')!
    assert.equal(plan.monthlyPrice, 1200)
    assert.equal(plan.monthlyDiscountBps, 2000)
    assert.equal(plan.monthlyEffectivePrice, 960)
    assert.equal(plan.quarterlyEffectivePrice, 2700)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT price FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.id)
          .first<any>()
      ).price,
      960,
    )
    await f.paid(checkout)
    await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'pro',
    )
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_discount_bps=1000,revision=revision+1 WHERE id='pro'",
      )
      .run()
    await syncDodoProducts(f.db, root, f.transport)
    assert.ok(
      [...f.products.values()].some((p) => p.price.discount_bps === 2000),
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT price FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.id)
          .first<any>()
      ).price,
      960,
    )
  } finally {
    await f.mf.dispose()
  }
})
test('multiple named Dodo profiles in one environment isolate callbacks, products and secrets', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { payment } = await f.paid(checkout),
      event = await f.sign('payment.succeeded', payment)
    await savePaymentProvider(f.db, root, 1, {
      id: 'second_merchant',
      name: 'Second merchant test',
      provider: 'dodo',
      environment: 'test',
      revision: 0,
      reason: 'Add another Dodo profile',
      credentials: { apiKey: 'api_test', webhookSecret },
    })
    const settings = await paymentSettings(f.db)
    await selectPaymentProvider(f.db, 1, {
      id: 'second_merchant',
      revision: settings.revision,
      reason: 'Switch merchant configuration',
    })
    await assert.rejects(
      receiveDodoEvent(
        f.db,
        root,
        'test',
        event.body,
        event.headers,
        f.transport,
        Date.now(),
        'dodo_test',
      ),
      { code: 'payment_unavailable' },
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).offers.length, 0)
    await syncDodoProducts(f.db, root, f.transport)
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_dodo_products WHERE provider_key='second_merchant'",
          )
          .first<any>()
      ).n,
      2,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_dodo_products WHERE provider_key='dodo_test'",
          )
          .first<any>()
      ).n,
      2,
    )
    await savePaymentProvider(f.db, root, 1, {
      id: 'second_merchant',
      name: 'Renamed merchant',
      provider: 'dodo',
      environment: 'test',
      revision: 1,
      reason: 'Rotate the API key only',
      credentials: { apiKey: 'api_test' },
    })
    assert.equal(
      (await paymentProviders(f.db)).find((p) => p.id === 'second_merchant')!
        .configured,
      true,
    )
    await assert.rejects(
      savePaymentProvider(f.db, root, 1, {
        id: 'second_merchant',
        name: 'Invalid move',
        provider: 'dodo',
        environment: 'live',
        revision: 2,
        reason: 'Attempt environment change',
      }),
      { code: 'payment_environment_invalid' },
    )
  } finally {
    await f.mf.dispose()
  }
})

test('product failures persist redacted backoff without starving later plans and reset after edits', async () => {
  const f = await fixture()
  try {
    await f.db
      .prepare(
        "INSERT INTO platform_plans(id,name,policy_json,currency,monthly_price,quarterly_price) SELECT 'zzz','Later Plan',policy_json,'USD',2000,5000 FROM platform_plans WHERE id='free'",
      )
      .run()
    let reject = true,
      rejectedCalls = 0
    const transport: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null
      if (
        reject &&
        body?.metadata?.chronoframe_plan_id === 'pro' &&
        body.price.payment_frequency_count === 1
      ) {
        rejectedCalls++
        return Response.json(
          { message: 'private-provider-body-and-api-key' },
          { status: 422 },
        )
      }
      return f.transport(input, init)
    }
    assert.equal(
      (await syncDodoProducts(f.db, root, transport, f.now)).processed,
      1,
    )
    let failure = await f.db
      .prepare("SELECT * FROM platform_dodo_sync_failures WHERE plan_id='pro'")
      .first<any>()
    assert.equal(failure.attempts, 1)
    assert.equal(failure.next_attempt_at, f.now + 30000)
    assert.equal(failure.error, 'payment_provider_validation_failed:http_422')
    assert.ok(!JSON.stringify(failure).includes('private-provider'))
    assert.equal(
      (await syncDodoProducts(f.db, root, transport, f.now + 1)).processed,
      2,
    )
    assert.equal(rejectedCalls, 1)
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT COUNT(*) AS n FROM platform_dodo_products WHERE plan_id='zzz'",
          )
          .first<any>()
      ).n,
      2,
    )
    await syncDodoProducts(f.db, root, transport, f.now + 30001)
    failure = await f.db
      .prepare("SELECT * FROM platform_dodo_sync_failures WHERE plan_id='pro'")
      .first<any>()
    assert.equal(failure.attempts, 2)
    assert.equal(failure.next_attempt_at, f.now + 90001)
    reject = false
    await f.db
      .prepare("UPDATE platform_plans SET revision=revision+1 WHERE id='pro'")
      .run()
    assert.equal(
      (await syncDodoProducts(f.db, root, transport, f.now + 30002)).processed,
      2,
    )
    assert.equal(
      await f.db
        .prepare(
          "SELECT * FROM platform_dodo_sync_failures WHERE plan_id='pro'",
        )
        .first(),
      null,
    )
    // An invalid local price and an isolated row-publication failure are also per-plan failures.
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_price=1,monthly_discount_bps=9999,revision=revision+1 WHERE id='pro'",
      )
      .run()
    assert.equal(
      (await syncDodoProducts(f.db, root, transport, f.now + 30003)).processed,
      1,
    )
    failure = await f.db
      .prepare("SELECT * FROM platform_dodo_sync_failures WHERE plan_id='pro'")
      .first<any>()
    assert.equal(failure.error, 'payment_price_invalid')
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_price=1200,monthly_discount_bps=0,revision=revision+1 WHERE id='pro'",
      )
      .run()
    let failWrite = true
    const db = {
      prepare(sql: string) {
        if (failWrite && sql.startsWith('INSERT INTO platform_dodo_products')) {
          failWrite = false
          throw Error('private database error')
        }
        return f.db.prepare(sql)
      },
      batch: (statements: any) => f.db.batch(statements),
    }
    assert.equal(
      (await syncDodoProducts(db, root, transport, f.now + 30004)).processed,
      1,
    )
    failure = await f.db
      .prepare("SELECT * FROM platform_dodo_sync_failures WHERE plan_id='pro'")
      .first<any>()
    assert.equal(failure.error, 'payment_product_sync_failed')
  } finally {
    await f.mf.dispose()
  }
})

test('stale Dodo attempts release slots only in the active profile and remain reconcilable by late events', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { payment } = await f.paid(checkout),
      event = await f.sign('payment.succeeded', payment, 'evt_late_payment')
    const old = f.now - 86400001
    await f.db
      .prepare(
        "UPDATE platform_payment_checkouts SET state='uncertain',provider_id=NULL,updated_at=? WHERE id=?",
      )
      .bind(old, checkout.id)
      .run()
    for (const [workspace, id, key, environment, updated] of [
      [2, 'stale_create', 'dodo_test', 'test', old],
      [3, 'other_environment', 'dodo_live', 'live', old],
      [4, 'fresh_create', 'dodo_test', 'test', f.now],
    ] as const) {
      if (workspace > 2) {
        await f.db
          .prepare(
            'INSERT INTO platform_users(id,email,name,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)',
          )
          .bind(workspace, id + '@example.com', id, f.now, f.now)
          .run()
        await f.db
          .prepare(
            'INSERT INTO platform_workspaces(id,name,owner_user_id,created_at) VALUES(?,?,?,?)',
          )
          .bind(workspace, id, workspace, f.now)
          .run()
      }
      await f.db
        .prepare(
          "INSERT INTO platform_payment_checkouts(id,workspace_id,user_id,request_id,plan_id,interval,product_id,price,currency,assignment_revision,state,created_at,updated_at,provider,environment,provider_key) VALUES(?,?,2,?,'pro',1,'pdt_fixture',1200,'USD',1,'creating',?,?,'dodo',?,?)",
        )
        .bind(id, workspace, id, updated, updated, environment, key)
        .run()
    }
    await f.db.prepare('UPDATE platform_payment_settings SET enabled=0').run()
    await reconcileDodoPayments(f.db, root, f.transport, f.now)
    assert.equal(
      (
        await f.db
          .prepare('SELECT state FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.id)
          .first<any>()
      ).state,
      'uncertain',
    )
    await f.db.prepare('UPDATE platform_payment_settings SET enabled=1').run()
    await reconcileDodoPayments(f.db, root, f.transport, f.now)
    const rows = (
      await f.db
        .prepare('SELECT id,state FROM platform_payment_checkouts')
        .all<any>()
    ).results
    const state = (id: string) => rows.find((row: any) => row.id === id)?.state
    assert.equal(state(checkout.id), 'expired')
    assert.equal(state('stale_create'), 'expired')
    assert.equal(state('other_environment'), 'creating')
    assert.equal(state('fresh_create'), 'creating')
    // Expiration frees checkout capacity but does not declare unknown billing safe for account erasure.
    assert.equal(await closeAccountPayments(f.db, root, 1, f.transport), false)
    const retry = await createPaymentCheckout(
      f.db,
      root,
      1,
      input('retry_after_expiry'),
      'https://portal.example',
      f.transport,
    )
    assert.ok(retry.url)
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await processDodoEvents(f.db, root, f.transport)
    assert.equal(
      (
        await f.db
          .prepare('SELECT state FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.id)
          .first<any>()
      ).state,
      'completed',
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'pro',
    )
  } finally {
    await f.mf.dispose()
  }
})

test('product synchronization supports legacy required discounts without silently changing fractional discounts', async () => {
  const f = await fixture()
  try {
    const legacy: typeof fetch = async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      )
      if (url.pathname === '/products' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        if (!Number.isInteger(body.price.discount))
          return Response.json(
            { message: 'missing field `discount`' },
            { status: 422 },
          )
        const response = await f.transport(input, init),
          product = (await response.json()) as any
        delete product.price.discount_bps
        f.products.set(product.product_id, product)
        return Response.json(product)
      }
      return f.transport(input, init)
    }
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_discount_bps=2000,quarterly_discount_bps=2000,revision=revision+1 WHERE id='pro'",
      )
      .run()
    assert.deepEqual(await syncDodoProducts(f.db, root, legacy), {
      processed: 2,
      failed: 0,
    })
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      legacy,
    )
    assert.ok(checkout.url)
    assert.equal(
      (
        await f.db
          .prepare('SELECT price FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.id)
          .first<any>()
      ).price,
      960,
    )
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_discount_bps=1250,revision=revision+1 WHERE id='pro'",
      )
      .run()
    const result = await syncDodoProducts(f.db, root, legacy)
    assert.equal(result.failed, 1)
    const failure = await f.db
      .prepare(
        "SELECT error FROM platform_dodo_sync_failures WHERE provider_key='dodo_test' AND interval=1",
      )
      .first<any>()
    assert.equal(failure.error, 'payment_discount_precision_unsupported')
    assert.equal(
      (await paymentStatus(f.db, 1, 1)).offers.filter((o) => o.interval === 1)
        .length,
      0,
    )
  } finally {
    await f.mf.dispose()
  }
})
test('manual synchronization retries immediately and reports only safe HTTP and schema diagnostics', async () => {
  const f = await fixture()
  try {
    let attempts = 0,
      status = 401
    const rejected: typeof fetch = async () => {
      attempts++
      return Response.json(
        {
          message: 'missing field `discount`',
          private_key: 'secret-do-not-store',
          detail: [
            { loc: ['body', 'price', 'discount'], input: 'secret-input' },
          ],
        },
        { status },
      )
    }
    assert.deepEqual(await syncDodoProducts(f.db, root, rejected, f.now), {
      processed: 0,
      failed: 2,
    })
    let row = await f.db
      .prepare(
        "SELECT * FROM platform_dodo_sync_failures WHERE provider_key='dodo_test' AND interval=1",
      )
      .first<any>()
    assert.equal(row.error, 'payment_provider_authentication_failed:http_401')
    await syncDodoProducts(f.db, root, rejected, f.now + 1)
    assert.equal(attempts, 2)
    status = 422
    await syncDodoProducts(f.db, root, rejected, f.now + 2, 20, true)
    assert.equal(attempts, 4)
    row = await f.db
      .prepare(
        "SELECT * FROM platform_dodo_sync_failures WHERE provider_key='dodo_test' AND interval=1",
      )
      .first<any>()
    assert.equal(
      row.error,
      'payment_provider_validation_failed:http_422:price.discount',
    )
    assert.ok(!JSON.stringify(row).includes('secret'))
    status = 403
    await syncDodoProducts(f.db, root, rejected, f.now + 3, 20, true)
    row = await f.db
      .prepare(
        "SELECT * FROM platform_dodo_sync_failures WHERE provider_key='dodo_test' AND interval=1",
      )
      .first<any>()
    assert.equal(row.error, 'payment_provider_permission_denied:http_403')
    assert.deepEqual(
      await syncDodoProducts(f.db, root, f.transport, f.now + 4, 20, true),
      { processed: 2, failed: 0 },
    )
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_dodo_sync_failures')
          .first<any>()
      ).n,
      0,
    )
  } finally {
    await f.mf.dispose()
  }
})

for (const months of [1, 3]) {
  test(`initial ${months}-month checkout recovers missing service periods without accepting unrelated billing dates`, async () => {
    const f = await fixture()
    try {
      await syncDodoProducts(f.db, root, f.transport)
      const checkout = await createPaymentCheckout(
        f.db,
        root,
        1,
        { ...input(), interval: months },
        'https://portal.example',
        f.transport,
      )
      const { sub, payment } = await f.paid(checkout, months)
      const legacy = payment as any
      if (months === 1) delete legacy.service_periods
      else legacy.service_periods = []
      legacy.charge_type = 'renewal'
      const refresh = () =>
        refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport)
      await assert.rejects(refresh(), { code: 'payment_period_invalid' })
      legacy.charge_type = 'new'
      const start = sub.previous_billing_date
      sub.previous_billing_date = new Date(f.now - 86400000).toISOString()
      await assert.rejects(refresh(), { code: 'payment_period_invalid' })
      sub.previous_billing_date = start
      const end = sub.next_billing_date
      sub.next_billing_date = new Date(
        f.now + (months * 31 + 2) * 86400000,
      ).toISOString()
      await assert.rejects(refresh(), { code: 'payment_period_invalid' })
      sub.next_billing_date = end
      // A service period for another subscription must not trigger the fallback.
      legacy.service_periods = [
        { subscription_id: 'sub_other', starts_at: start, ends_at: end },
      ]
      await assert.rejects(refresh(), { code: 'payment_period_invalid' })
      delete legacy.service_periods
      delete legacy.charge_type // Older API responses can omit both new fields.
      assert.equal((await refresh()).state, 'completed')
      const assignment = () =>
        f.db
          .prepare(
            'SELECT * FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      const granted = await assignment()
      assert.equal(granted.plan_id, 'pro')
      assert.equal(granted.starts_at, Date.parse(start))
      assert.equal(granted.expires_at, Date.parse(end))
      await refresh()
      assert.equal((await assignment()).starts_at, granted.starts_at)
      assert.equal((await assignment()).revision, granted.revision)
      // Subscription dates moving forward cannot extend access without a paid service period.
      sub.previous_billing_date = end
      sub.next_billing_date = new Date(
        f.now + months * 56 * 86400000,
      ).toISOString()
      await refresh()
      assert.equal((await assignment()).expires_at, granted.expires_at)
    } finally {
      await f.mf.dispose()
    }
  })
}

test('adaptive-currency payments fulfill before any refund and cancellation later converges', async () => {
  const f = await fixture()
  try {
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_price=499,monthly_discount_bps=1000,revision=revision+1 WHERE id='pro'",
      )
      .run()
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const request = f.calls.find(
      (c) => new URL(c.url).pathname === '/checkouts' && c.method === 'POST',
    )!
    assert.equal(request.body.billing_currency, 'USD')
    const { sub, payment, session } = await f.paid(checkout)
    const adaptive = payment as any
    adaptive.currency = 'CNY'
    adaptive.total_amount = 3110
    adaptive.settlement_currency = 'USD'
    adaptive.settlement_amount = 449
    delete adaptive.service_periods
    session.payment_status = 'processing' // Session status can lag the actual payment.
    assert.equal(
      (await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport))
        .state,
      'completed',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'pro',
    )
    // This occurs after fulfillment; refunds must not be blamed for the initial failure.
    adaptive.refunds.push({ status: 'succeeded', amount: 500 })
    sub.status = 'cancelled'
    assert.equal(
      (await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport))
        .state,
      'inactive',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'free',
    )
  } finally {
    await f.mf.dispose()
  }
})

test('unfulfilled partial refunds stop offering checkout and cancellation releases the pending slot without granting access', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { sub, payment } = await f.paid(checkout)
    const adaptive = payment as any
    adaptive.currency = 'CNY'
    adaptive.total_amount = 8320
    adaptive.settlement_currency = 'USD'
    adaptive.settlement_amount = 1200
    adaptive.refunds.push({ status: 'succeeded', amount: 500 })
    await assert.rejects(
      refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport),
      { code: 'payment_refunded_or_disputed', statusCode: 422 },
    )
    let status = await paymentStatus(f.db, 1, 1)
    assert.equal(status.pending.state, 'uncertain')
    assert.equal(status.pending.url, null)
    assert.equal(status.pending.canRefresh, 1)
    assert.equal(status.pending.error, 'payment_refunded_or_disputed')
    // A scheduled cancellation is still an active provider subscription: do not open a second one.
    sub.cancel_at_next_billing_date = true
    await assert.rejects(
      refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport),
      { code: 'payment_refunded_or_disputed' },
    )
    sub.status = 'cancelled'
    await reconcileDodoPayments(f.db, root, f.transport)
    status = await paymentStatus(f.db, 1, 1)
    assert.equal(status.pending, null)
    assert.equal(
      (await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport))
        .state,
      'inactive',
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'free',
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT COUNT(*) AS count FROM platform_payment_subscriptions',
          )
          .first<any>()
      ).count,
      0,
    )
    await createPaymentCheckout(
      f.db,
      root,
      1,
      input('new_after_cancel'),
      'https://portal.example',
      f.transport,
    )
  } finally {
    await f.mf.dispose()
  }
})

test('amount and identity mismatches have safe diagnostics, cannot grant, and cannot be resumed as unpaid', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { sub, payment } = await f.paid(checkout)
    const adaptive = payment as any
    adaptive.currency = 'CNY'
    adaptive.total_amount = 8320
    adaptive.settlement_currency = 'USD'
    adaptive.settlement_amount = 1
    const refresh = () =>
      refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport)
    await assert.rejects(refresh(), {
      code: 'payment_amount_mismatch',
      statusCode: 422,
    })
    assert.equal((await paymentStatus(f.db, 1, 1)).pending.url, null)
    adaptive.settlement_amount = 1200
    adaptive.settlement_currency = 'EUR'
    await assert.rejects(refresh(), { code: 'payment_amount_mismatch' })
    adaptive.settlement_currency = 'USD'
    adaptive.customer = { customer_id: 'cus_other' }
    sub.status = 'cancelled'
    await assert.rejects(refresh(), { code: 'payment_customer_mismatch' })
    assert.notEqual((await paymentStatus(f.db, 1, 1)).pending, null)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'free',
    )
    adaptive.customer = sub.customer
    sub.status = 'active'
    sub.currency = 'CNY' // Both base-currency and local-currency subscription responses are supported.
    assert.equal((await refresh()).state, 'completed')
  } finally {
    await f.mf.dispose()
  }
})

test('failed payments without a subscription close the unpaid checkout', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      'https://portal.example',
      f.transport,
    )
    const { payment } = await f.paid(checkout)
    const failed = payment as any
    failed.status = 'failed'
    failed.subscription_id = null
    failed.subscription_ids = []
    assert.equal(
      (await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport))
        .state,
      'expired',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
  } finally {
    await f.mf.dispose()
  }
})
