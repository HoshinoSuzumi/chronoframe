import {
  savePaymentPlanRule,
  previewPaymentPlanChange,
  commitPaymentPlanChange,
  checkPaymentPlanChange,
} from '../packages/platform/src/subscription-changes.ts'
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
  createPaymentPortal,
  closeAccountPayments,
} from '../packages/platform/src/payments.ts'
import {
  cancelDeferredSubscription,
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
    if (url.pathname === '/checkouts/preview')
      return Response.json({
        payment_method_required: true,
        current_breakup: { total_amount: 0 },
        trial_amount: null,
      })
    if (url.pathname === '/checkouts' && init?.method === 'POST') {
      if (createUncertain) throw Error('provider raw secret')
      const id = 'cks_' + environment + '_' + sessions.size
      sessions.set(id, {
        id,
        metadata: body.metadata,
        product_id: body.product_cart[0].product_id,
        payment_id: null,
        payment_status: null,
        trial_period_days: body.subscription_data?.trial_period_days ?? 0,
      })
      return Response.json({
        session_id: id,
        checkout_url: `https://${environment === 'test' ? 'test.' : ''}checkout.dodopayments.com/session/${id}`,
      })
    }
    if (url.pathname.startsWith('/checkouts/'))
      return Response.json(sessions.get(url.pathname.split('/')[2]!))
    if (url.pathname.startsWith('/subscriptions/')) {
      const sub = subscriptions.get(url.pathname.split('/')[2]!)
      if (init?.method === 'PATCH') Object.assign(sub, body)
      return Response.json(sub)
    }
    if (url.pathname === '/subscriptions')
      return Response.json({ items: [...subscriptions.values()] })
    if (url.pathname === '/payments')
      return Response.json({ items: [...payments.values()] })
    if (url.pathname.endsWith('/line-items')) {
      const payment = payments.get(url.pathname.split('/')[2]!)
      const sub = subscriptions.get(payment.subscription_id)
      const currency =
        url.searchParams.get('currency') ??
        payment.settlement_currency ??
        payment.currency
      const total =
        currency === payment.currency
          ? payment.total_amount
          : payment.settlement_amount
      return Response.json(
        payment.lineItems ?? {
          currency,
          items: [
            {
              items_id: sub.product_id,
              amount: total - (payment.tax ?? 0),
              tax: payment.tax ?? 0,
            },
          ],
        },
      )
    }
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
    assert.match(
      [...f.products.values()][0].description,
      /Platform storage:\*\*/,
    )
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

async function changeFixture() {
  const f = await fixture()
  await f.db
    .prepare(
      "INSERT INTO platform_plans(id,name,policy_json,currency,monthly_price,quarterly_price,sort_order) SELECT 'studio','Studio',policy_json,'USD',2400,6000,3 FROM platform_plans WHERE id='free'",
    )
    .run()
  await syncDodoProducts(f.db, root, f.transport, f.now, 20)
  const checkout = await createPaymentCheckout(
    f.db,
    root,
    1,
    input(),
    'https://portal.example',
    f.transport,
  )
  const paid = await f.paid(checkout)
  await refreshDodoCheckout(f.db, root, 1, 1, checkout.id, f.transport)
  const mutations: any[] = []
  let outcome = 'apply'
  let scheduled: any = null
  let portalURL = 'https://test.customer.dodopayments.com/session/fixture'
  const apply = (body: any, now = f.now) => {
    paid.sub.product_id = body.product_id
    paid.sub.previous_billing_date = new Date(now - 1000).toISOString()
    paid.sub.next_billing_date = new Date(now + 28 * 86400000).toISOString()
    ;(paid.sub as any).scheduled_change = null
  }
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (url.pathname.endsWith('/change-plan/preview')) {
      return Response.json({
        new_plan: { ...paid.sub, product_id: body.product_id },
        immediate_charge: {
          effective_at:
            body.effective_at === 'next_billing_date'
              ? paid.sub.next_billing_date
              : new Date(f.now).toISOString(),
          line_items: [],
          summary: {
            currency: 'USD',
            total_amount: body.effective_at === 'next_billing_date' ? 0 : 600,
            settlement_currency: 'USD',
            settlement_amount: 600,
            customer_credits: 0,
            customer_credits_currency: 'USD',
          },
        },
      })
    }
    if (url.pathname.endsWith('/change-plan')) {
      mutations.push(body)
      assert.equal(body.on_payment_failure, 'prevent_change')
      assert.equal(body.discount_codes, undefined)
      if (outcome === 'timeout') throw Error('network after provider accepted')
      if (outcome === 'reject')
        return Response.json({ code: 'invalid' }, { status: 422 })
      if (body.effective_at === 'next_billing_date') {
        scheduled = body
        ;(paid.sub as any).scheduled_change = { product_id: body.product_id }
      } else if (outcome === 'apply') apply(body)
      return Response.json({})
    }
    if (url.pathname.endsWith('/customer-portal/session'))
      return Response.json({ link: portalURL })
    return f.transport(input, init)
  }
  const rule = async (from: string, to: string, direction = 'upgrade') =>
    savePaymentPlanRule(f.db, 1, {
      fromPlan: from,
      toPlan: to,
      direction,
      enabled: true,
      revision: 0,
      reason: 'Configure allowed subscription transitions',
    })
  const assignment = () =>
    f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
  return {
    ...f,
    ...paid,
    checkout,
    transport,
    mutations,
    rule,
    assignment,
    setOutcome: (value: string) => {
      outcome = value
    },
    setPortal: (value: string) => {
      portalURL = value
    },
    applyScheduled: (now: number) => apply(scheduled, now),
  }
}

test('directed subscription rules validate paid plans and audit changes with revision checks', async () => {
  const f = await changeFixture()
  try {
    await assert.rejects(f.rule('free', 'studio'), {
      code: 'payment_change_rule_invalid',
    })
    await f.rule('pro', 'studio')
    await assert.rejects(f.rule('pro', 'studio'), { code: 'revision_conflict' })
    await assert.rejects(
      previewPaymentPlanChange(
        f.db,
        root,
        1,
        { workspaceId: 1, planId: 'free' },
        f.transport,
      ),
      { code: 'payment_change_not_allowed' },
    )
    await assert.rejects(
      previewPaymentPlanChange(
        f.db,
        root,
        2,
        { workspaceId: 1, planId: 'studio' },
        f.transport,
      ),
      { code: 'workspace_admin_required' },
    )
    const audit = await f.db
      .prepare(
        "SELECT after_json FROM platform_admin_audit WHERE action='payment.plan-rule'",
      )
      .first<any>()
    assert.equal(JSON.parse(audit.after_json).to, 'studio')
    await savePaymentPlanRule(f.db, 1, {
      fromPlan: 'pro',
      toPlan: 'studio',
      direction: 'upgrade',
      enabled: false,
      revision: 1,
      reason: 'Disable this transition',
    })
    await assert.rejects(
      previewPaymentPlanChange(
        f.db,
        root,
        1,
        { workspaceId: 1, planId: 'studio' },
        f.transport,
      ),
      { code: 'payment_change_not_allowed' },
    )
    assert.equal(f.mutations.length, 0)
  } finally {
    await f.mf.dispose()
  }
})

test('previewed upgrades change the existing subscription without resetting the quota anchor or original checkout', async () => {
  const f = await changeFixture()
  try {
    await f.rule('pro', 'studio')
    const before = await f.assignment()
    const quote = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'studio' },
      f.transport,
    )
    assert.equal(quote.charge.total_amount, 600)
    assert.equal((await f.assignment()).plan_id, 'pro')
    assert.equal(
      (await commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport))
        .state,
      'applied',
    )
    assert.equal(f.mutations.length, 1)
    assert.equal(
      f.mutations[0].proration_billing_mode,
      'prorated_immediately_keep_cycle',
    )
    assert.equal(f.mutations[0].effective_at, 'immediately')
    const after = await f.assignment()
    assert.equal(after.plan_id, 'studio')
    assert.equal(after.starts_at, before.starts_at)
    const original = await f.db
      .prepare('SELECT * FROM platform_payment_checkouts WHERE id=?')
      .bind(f.checkout.id)
      .first<any>()
    assert.notEqual(original.product_id, f.sub.product_id)
    assert.equal(original.price, 1200)
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_subscriptions')
          .first<any>()
      ).n,
      1,
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).planChange, null)
    assert.equal((await paymentStatus(f.db, 1, 1)).hasActiveSubscription, true)
    assert.equal((await paymentStatus(f.db, 1, 1)).canOpenPortal, true)
    assert.equal(
      (await createPaymentPortal(f.db, root, 1, 1, f.transport)).url,
      'https://test.customer.dodopayments.com/session/fixture',
    )
  } finally {
    await f.mf.dispose()
  }
})

test('scheduled downgrades retain the paid tier until the provider switches at renewal', async () => {
  const f = await changeFixture()
  try {
    await f.rule('pro', 'studio')
    const up = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'studio' },
      f.transport,
    )
    await commitPaymentPlanChange(f.db, root, 1, 1, up.id, f.transport)
    await f.rule('studio', 'pro', 'downgrade')
    const down = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'pro' },
      f.transport,
    )
    assert.equal(down.charge.total_amount, 0)
    assert.equal(
      (await commitPaymentPlanChange(f.db, root, 1, 1, down.id, f.transport))
        .state,
      'scheduled',
    )
    assert.equal((await f.assignment()).plan_id, 'studio')
    assert.equal(f.mutations[1].effective_at, 'next_billing_date')
    assert.equal(f.mutations[1].proration_billing_mode, 'full_immediately')
    const later = f.now + 28 * 86400000
    f.applyScheduled(later)
    await checkPaymentPlanChange(f.db, root, 1, 1, f.transport, later)
    // The provider product switch alone must not buy the next billing period.
    assert.equal((await f.assignment()).plan_id, 'free')
    const unpaid = await f.db
      .prepare('SELECT period_end FROM platform_payment_subscriptions')
      .first<any>()
    assert.ok(unpaid.period_end <= later)
    f.sub.status = 'on_hold'
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      f.checkout.id,
      f.transport,
      later,
    )
    assert.equal((await f.assignment()).plan_id, 'free')
    assert.equal(
      (
        await f.db
          .prepare('SELECT period_end FROM platform_payment_subscriptions')
          .first<any>()
      ).period_end,
      unpaid.period_end,
    )
    f.sub.status = 'active'
    const renewed = {
      ...f.payment,
      payment_id: 'pay_paid_downgrade',
      charge_type: 'renewal',
      created_at: new Date(later).toISOString(),
      service_periods: [
        {
          subscription_id: f.sub.subscription_id,
          starts_at: new Date(later).toISOString(),
          ends_at: new Date(later + 28 * 86400000).toISOString(),
        },
      ],
    }
    f.payments.set(renewed.payment_id, renewed)
    const event = await f.sign(
      'payment.succeeded',
      renewed,
      'evt_paid_downgrade',
    )
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await processDodoEvents(f.db, root, f.transport, later)
    assert.equal((await f.assignment()).plan_id, 'pro')
    assert.equal((await f.assignment()).expires_at, later + 28 * 86400000)
    assert.equal((await paymentStatus(f.db, 1, 1)).planChange, null)
  } finally {
    await f.mf.dispose()
  }
})

test('failed and ambiguous plan changes never grant benefits or repeat a saved-method charge', async () => {
  const f = await changeFixture()
  try {
    await f.rule('pro', 'studio')
    let quote = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'studio' },
      f.transport,
    )
    f.setOutcome('reject')
    await assert.rejects(
      commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport),
    )
    assert.equal((await f.assignment()).plan_id, 'pro')
    assert.equal((await paymentStatus(f.db, 1, 1)).planChange, null)
    quote = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'studio' },
      f.transport,
    )
    f.setOutcome('timeout')
    await assert.rejects(
      commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport),
    )
    assert.equal(
      (await commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport))
        .state,
      'uncertain',
    )
    assert.equal(f.mutations.length, 2)
    assert.equal((await f.assignment()).plan_id, 'pro')
    await assert.rejects(
      previewPaymentPlanChange(
        f.db,
        root,
        1,
        { workspaceId: 1, planId: 'studio' },
        f.transport,
      ),
      { code: 'payment_change_pending' },
    )
  } finally {
    await f.mf.dispose()
  }
})

test('revoked rules, stale quotes, disabled payments and unsafe customer portal links fail closed', async () => {
  const f = await changeFixture()
  try {
    await f.rule('pro', 'studio')
    const quote = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'studio' },
      f.transport,
    )
    await savePaymentPlanRule(f.db, 1, {
      fromPlan: 'pro',
      toPlan: 'studio',
      direction: 'upgrade',
      enabled: false,
      revision: 1,
      reason: 'Revoke this transition',
    })
    await assert.rejects(
      commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport),
      { code: 'payment_quote_expired' },
    )
    assert.equal(f.mutations.length, 0)
    f.setPortal('https://untrusted.example/steal')
    await assert.rejects(createPaymentPortal(f.db, root, 1, 1, f.transport), {
      code: 'payment_redirect_invalid',
    })
    await f.db
      .prepare(
        "UPDATE platform_memberships SET role='admin' WHERE workspace_id=1 AND user_id=2",
      )
      .run()
    await assert.rejects(createPaymentPortal(f.db, root, 2, 1, f.transport), {
      code: 'payment_portal_unavailable',
    })
    await f.db.prepare('UPDATE platform_payment_settings SET enabled=0').run()
    const calls = f.calls.length
    await assert.rejects(
      commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport),
      { code: 'payment_unavailable' },
    )
    await assert.rejects(createPaymentPortal(f.db, root, 1, 1, f.transport), {
      code: 'payment_unavailable',
    })
    assert.equal(f.calls.length, calls)
  } finally {
    await f.mf.dispose()
  }
})

test('accepted changes await provider application; failed change payments retain the existing paid plan', async () => {
  const f = await changeFixture()
  try {
    await f.rule('pro', 'studio')
    f.setOutcome('delayed')
    const quote = await previewPaymentPlanChange(
      f.db,
      root,
      1,
      { workspaceId: 1, planId: 'studio' },
      f.transport,
    )
    assert.equal(
      (await commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport))
        .state,
      'pending',
    )
    assert.equal((await f.assignment()).plan_id, 'pro')
    assert.equal(
      (await commitPaymentPlanChange(f.db, root, 1, 1, quote.id, f.transport))
        .state,
      'pending',
    )
    assert.equal(f.mutations.length, 1)
    const failed = {
      ...f.payment,
      payment_id: 'pay_change_failed',
      status: 'failed',
      charge_type: 'plan_change',
      metadata: { ...f.payment.metadata, chronoframe_change_id: quote.id },
    }
    f.payments.set(failed.payment_id, failed)
    const event = await f.sign('payment.failed', failed, 'evt_change_failed')
    await receiveDodoEvent(
      f.db,
      root,
      'test',
      event.body,
      event.headers,
      f.transport,
    )
    await processDodoEvents(f.db, root, f.transport)
    assert.equal((await f.assignment()).plan_id, 'pro')
    assert.equal((await paymentStatus(f.db, 1, 1)).planChange, null)
    assert.equal(
      (
        await f.db
          .prepare('SELECT state FROM platform_payment_plan_changes WHERE id=?')
          .bind(quote.id)
          .first<any>()
      ).state,
      'failed',
    )
  } finally {
    await f.mf.dispose()
  }
})

for (const state of ['submitting', 'pending', 'scheduled', 'uncertain']) {
  test(`stale ${state} plan changes settle without retrying a charge, while live schedules and payments remain protected`, async () => {
    const f = await changeFixture()
    try {
      await f.rule('pro', 'studio')
      const quote = await previewPaymentPlanChange(
        f.db,
        root,
        1,
        { workspaceId: 1, planId: 'studio' },
        f.transport,
      )
      await f.db
        .prepare('UPDATE platform_payment_plan_changes SET state=? WHERE id=?')
        .bind(state, quote.id)
        .run()
      const change = await f.db
        .prepare('SELECT * FROM platform_payment_plan_changes WHERE id=?')
        .bind(quote.id)
        .first<any>()
      const getState = async () =>
        (
          await f.db
            .prepare(
              'SELECT state FROM platform_payment_plan_changes WHERE id=?',
            )
            .bind(quote.id)
            .first<any>()
        ).state
      await checkPaymentPlanChange(f.db, root, 1, 1, f.transport)
      assert.equal(await getState(), state) // Grace period has not elapsed.
      const later = Date.now() + 16 * 60000
      ;(f.sub as any).scheduled_change = { product_id: change.to_product }
      await checkPaymentPlanChange(f.db, root, 1, 1, f.transport, later)
      assert.equal(await getState(), state)
      ;(f.sub as any).scheduled_change = null
      const charge = {
        ...f.payment,
        payment_id: 'pay_unsettled_change',
        status: 'processing',
        charge_type: 'plan_change',
        created_at: new Date(change.created_at).toISOString(),
        metadata: { ...f.payment.metadata, chronoframe_change_id: quote.id },
      }
      f.payments.set(charge.payment_id, charge)
      await checkPaymentPlanChange(f.db, root, 1, 1, f.transport, later)
      assert.equal(await getState(), state)
      charge.status = 'succeeded' // A settled charge waiting for application is also protected.
      await checkPaymentPlanChange(f.db, root, 1, 1, f.transport, later)
      assert.equal(await getState(), state)
      f.payments.delete(charge.payment_id)
      ;(f.sub as any).scheduled_change = {
        product_id: 'pdt_some_other_schedule',
      }
      await checkPaymentPlanChange(f.db, root, 1, 1, f.transport, later)
      assert.equal(await getState(), 'failed')
      assert.equal((await paymentStatus(f.db, 1, 1)).planChange, null)
      assert.equal((await f.assignment()).plan_id, 'pro')
      assert.equal(f.mutations.length, 0)
      ;(f.sub as any).scheduled_change = null
      await previewPaymentPlanChange(
        f.db,
        root,
        1,
        { workspaceId: 1, planId: 'studio' },
        f.transport,
      )
      assert.equal(f.mutations.length, 0)
    } finally {
      await f.mf.dispose()
    }
  })
}

const origin = 'https://app.chronoframe.art'
async function handoverFixture(source = 'activation', higher = false) {
  const f = await fixture(),
    originalStart = f.now - 2 * 86400000,
    originalEnd = f.now + 3.4 * 86400000
  await f.db
    .prepare(
      "UPDATE platform_workspace_plans SET plan_id='pro',source=?,starts_at=?,expires_at=?,revision=revision+1 WHERE workspace_id=1",
    )
    .bind(source, originalStart, originalEnd)
    .run()
  if (higher) {
    await f.db
      .prepare(
        "INSERT INTO platform_plans(id,name,policy_json,currency,monthly_price,quarterly_price) SELECT 'studio','Studio',policy_json,'USD',2400,6000 FROM platform_plans WHERE id='pro'",
      )
      .run()
    await savePaymentPlanRule(
      f.db,
      1,
      {
        fromPlan: 'pro',
        toPlan: 'studio',
        direction: 'upgrade',
        enabled: true,
        revision: 0,
        reason: 'Allow paid tier upgrades',
      },
      f.now,
    )
  }
  await syncDodoProducts(f.db, root, f.transport, f.now, 10)
  return { ...f, originalStart, originalEnd }
}
async function authorizeHandover(
  f: Awaited<ReturnType<typeof handoverFixture>>,
  planId = 'pro',
) {
  const checkout = await createPaymentCheckout(
    f.db,
    root,
    1,
    { ...input('handover_checkout'), planId, startMode: 'after_entitlement' },
    origin,
    f.transport,
    f.now,
  )
  const { sub, payment, session } = await f.paid(checkout)
  sub.trial_period_days = session.trial_period_days
  sub.previous_billing_date = new Date(f.now).toISOString()
  const at = f.now + sub.trial_period_days * 86400000
  sub.next_billing_date = new Date(at).toISOString()
  payment.total_amount = 0
  payment.service_periods = []
  const result = await refreshDodoCheckout(
    f.db,
    root,
    1,
    1,
    checkout.id,
    f.transport,
    f.now + 1000,
  )
  assert.equal(result.state, 'scheduled')
  return { checkout, sub, payment, session, at }
}
for (const source of ['promotion', 'activation'])
  test(`${source} same-tier conversion authorizes without charging, preserves quota anchor, then activates only a paid service period`, async () => {
    const f = await handoverFixture(source)
    try {
      const { checkout, sub, payment, at } = await authorizeHandover(f)
      assert.equal(sub.trial_period_days, 4)
      assert.ok(at >= f.originalEnd)
      const before = await f.db
        .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
        .first<any>()
      assert.equal(before.source, source)
      assert.equal(before.starts_at, f.originalStart)
      assert.equal(before.expires_at, at)
      const status = await paymentStatus(f.db, 1, 1)
      assert.equal((status.reservation as any).startsAt, at)
      assert.equal(status.hasActiveSubscription, true)
      assert.equal(status.canOpenPortal, true)
      const { requireNoHandover } =
        await import('../packages/platform/src/payment-handover.ts')
      await assert.rejects(requireNoHandover(f.db, 1), {
        code: 'payment_handover_exists',
      })
      await refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 2000,
      )
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
      sub.previous_billing_date = new Date(at).toISOString()
      sub.next_billing_date = new Date(at + 28 * 86400000).toISOString()
      const first = {
        ...payment,
        payment_id: 'pay_first_handover',
        total_amount: 1200,
        created_at: new Date(at + 1000).toISOString(),
        service_periods: [
          {
            subscription_id: sub.subscription_id,
            starts_at: sub.previous_billing_date,
            ends_at: sub.next_billing_date,
          },
        ],
      }
      f.payments.set(first.payment_id, first)
      const completed = await refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        at + 2000,
      )
      assert.equal(completed.state, 'completed')
      const grant = await f.db
        .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
        .first<any>()
      assert.equal(grant.source, 'payment')
      assert.equal(grant.plan_id, 'pro')
      assert.equal(grant.starts_at, at)
      assert.equal(grant.expires_at, at + 28 * 86400000)
      assert.equal(
        (
          await f.db
            .prepare(
              'SELECT activation_state FROM platform_payment_subscriptions',
            )
            .first<any>()
        ).activation_state,
        'paid',
      )
      await refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        at + 3000,
      )
      assert.equal(
        (
          await f.db
            .prepare(
              'SELECT starts_at FROM platform_workspace_plans WHERE workspace_id=1',
            )
            .first<any>()
        ).starts_at,
        at,
      )
    } finally {
      await f.mf.dispose()
    }
  })
test('deferred higher-tier purchase keeps the old tier until first payment; failure cannot extend complimentary access', async () => {
  const f = await handoverFixture('activation', true)
  try {
    const { checkout, sub, payment, at } = await authorizeHandover(f, 'studio')
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
    payment.status = 'failed'
    payment.total_amount = 2400
    sub.status = 'on_hold'
    sub.next_billing_date = new Date(at + 28 * 86400000).toISOString()
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      at + 2000,
    )
    const grant = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.equal(grant.plan_id, 'pro')
    assert.equal(grant.expires_at, at)
    assert.equal((await paymentStatus(f.db, 1, 1)).canOpenPortal, true)
    const { resolveSubscription } =
      await import('../packages/platform/src/subscriptions.ts')
    assert.equal((await resolveSubscription(f.db, 1, at + 2000)).id, 'free')
  } finally {
    await f.mf.dispose()
  }
})
test('reservation cancellation restores original expiry and releases code redemption; wrong owners and imminent billing cannot cancel', async () => {
  const f = await handoverFixture()
  try {
    const { checkout, sub, at } = await authorizeHandover(f)
    await assert.rejects(
      cancelDeferredSubscription(f.db, root, 2, 1, f.transport, f.now + 1000),
      { code: 'workspace_admin_required' },
    )
    await assert.rejects(
      cancelDeferredSubscription(f.db, root, 1, 1, f.transport, at - 1000),
      { code: 'payment_handover_due' },
    )
    await cancelDeferredSubscription(
      f.db,
      root,
      1,
      1,
      f.transport,
      f.now + 2000,
    )
    assert.equal(sub.status, 'cancelled')
    const grant = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.equal(grant.expires_at, f.originalEnd)
    assert.equal(grant.starts_at, f.originalStart)
    assert.equal(grant.source, 'activation')
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 3000,
        )
      ).state,
      'inactive',
    )
    const { requireNoHandover } =
      await import('../packages/platform/src/payment-handover.ts')
    await requireNoHandover(f.db, 1)
    assert.equal((await paymentStatus(f.db, 1, 1)).hasActiveSubscription, false)
  } finally {
    await f.mf.dispose()
  }
})
test('explicit immediate upgrades require replacement consent; invalid transitions and permanent same-tier conversion are rejected', async () => {
  const f = await handoverFixture('activation', true)
  try {
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        {
          ...input('upgrade_missing_consent'),
          planId: 'studio',
          startMode: 'immediate',
        },
        origin,
        f.transport,
        f.now,
      ),
      { code: 'payment_replace_confirmation_required' },
    )
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      {
        ...input('upgrade_with_consent'),
        planId: 'studio',
        startMode: 'immediate',
        replaceEntitlement: true,
      },
      origin,
      f.transport,
      f.now,
    )
    assert.equal(
      f.sessions.get(checkout.url.split('/').pop()!)?.trial_period_days,
      0,
    )
    await f.paid(checkout)
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 1000,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).plan_id,
      'studio',
    )
  } finally {
    await f.mf.dispose()
  }
  const permanent = await handoverFixture()
  try {
    await permanent.db
      .prepare(
        'UPDATE platform_workspace_plans SET expires_at=NULL WHERE workspace_id=1',
      )
      .run()
    await assert.rejects(
      createPaymentCheckout(
        permanent.db,
        root,
        1,
        input('permanent_conversion'),
        origin,
        permanent.transport,
        permanent.now,
      ),
      { code: 'permanent_plan_active' },
    )
  } finally {
    await permanent.mf.dispose()
  }
})

test('handover refuses cardless authorization and preserves the original grant', async () => {
  const f = await handoverFixture()
  try {
    const transport: typeof fetch = async (url, init) =>
      String(url).includes('/checkouts/preview')
        ? Response.json({
            payment_method_required: false,
            current_breakup: { total_amount: 0 },
          })
        : f.transport(url, init)
    await assert.rejects(
      createPaymentCheckout(
        f.db,
        root,
        1,
        input('cardless_handover'),
        origin,
        transport,
        f.now,
      ),
      { code: 'payment_trial_unavailable' },
    )
    assert.equal(f.sessions.size, 0)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT expires_at FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).expires_at,
      f.originalEnd,
    )
  } finally {
    await f.mf.dispose()
  }
})
test('superseded handovers cancel without overwriting a newer entitlement', async () => {
  const f = await handoverFixture()
  try {
    const { checkout, sub } = await authorizeHandover(f)
    await f.db
      .prepare(
        "UPDATE platform_workspace_plans SET source='manual',expires_at=?,revision=revision+1 WHERE workspace_id=1",
      )
      .bind(f.originalEnd + 10 * 86400000)
      .run()
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 2000,
    )
    assert.equal(sub.status, 'cancelled')
    const grant = await f.db
      .prepare(
        'SELECT source,expires_at FROM platform_workspace_plans WHERE workspace_id=1',
      )
      .first<any>()
    assert.equal(grant.source, 'manual')
    assert.equal(grant.expires_at, f.originalEnd + 10 * 86400000)
  } finally {
    await f.mf.dispose()
  }
})
test('an authorization without a payment ID converges and blocks redemption until canceled', async () => {
  const f = await handoverFixture()
  try {
    const { checkout, session } = await authorizeHandover(f)
    session.payment_id = null
    f.payments.clear()
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 2000,
        )
      ).state,
      'scheduled',
    )
    const { requireNoHandover } =
      await import('../packages/platform/src/payment-handover.ts')
    await assert.rejects(requireNoHandover(f.db, 1), {
      code: 'payment_handover_exists',
    })
  } finally {
    await f.mf.dispose()
  }
})

for (const invalid of ['checkout', 'date'])
  test(`new deferred authorization with invalid ${invalid} is canceled before rejection without granting rights`, async () => {
    const f = await handoverFixture()
    try {
      const checkout = await createPaymentCheckout(
        f.db,
        root,
        1,
        { ...input('invalid_handover'), startMode: 'after_entitlement' },
        origin,
        f.transport,
        f.now,
      )
      const { sub, payment, session } = await f.paid(checkout)
      sub.trial_period_days = session.trial_period_days
      sub.previous_billing_date = new Date(f.now).toISOString()
      sub.next_billing_date = new Date(f.now + 4 * 86400000).toISOString()
      payment.total_amount = 0
      payment.service_periods = []
      if (invalid === 'checkout')
        session.customer_email = 'different@example.com'
      else sub.next_billing_date = new Date(f.originalEnd - 1000).toISOString()
      await assert.rejects(
        refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        ),
        {
          code:
            invalid === 'checkout'
              ? 'payment_checkout_mismatch'
              : 'payment_handover_date_invalid',
        },
      )
      assert.equal(sub.status, 'cancelled')
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
      const grant = await f.db
        .prepare(
          'SELECT source,expires_at FROM platform_workspace_plans WHERE workspace_id=1',
        )
        .first<any>()
      assert.equal(grant.source, 'activation')
      assert.equal(grant.expires_at, f.originalEnd)
    } finally {
      await f.mf.dispose()
    }
  })

test('missing checkout linkage requires verified cancellation before rejecting a new authorization', async () => {
  const { reconcileDeferredAuthorization } =
    await import('../packages/platform/src/deferred-payments.ts')
  for (const confirmed of [false, true]) {
    let canceled = false,
      expired = false
    const db = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            expired = true
          },
        }),
      }),
    }
    const client = {
      subscriptions: {
        update: async () => {
          canceled = true
        },
        retrieve: async () => ({ status: confirmed ? 'cancelled' : 'active' }),
      },
    }
    await assert.rejects(
      reconcileDeferredAuthorization(
        db as any,
        client,
        {
          id: 'checkout_missing_link',
          handover_json: JSON.stringify({ trialDays: 4 }),
        },
        {
          subscription_id: 'sub_missing_link',
          status: 'active',
          trial_period_days: 4,
        },
        null,
        undefined,
        Date.now(),
        '1=1',
        [],
        'local_sub',
      ),
      {
        code: confirmed
          ? 'payment_checkout_mismatch'
          : 'payment_confirmation_pending',
      },
    )
    assert.equal(canceled, true)
    assert.equal(expired, confirmed)
  }
})

test('confirmed cancellation of a provider-less checkout releases handover blockers immediately', async () => {
  const f = await handoverFixture()
  try {
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...input('providerless_handover'), startMode: 'after_entitlement' },
      origin,
      f.transport,
      f.now,
    )
    const { sub, session } = await f.paid(checkout)
    sub.trial_period_days = session.trial_period_days
    await f.db
      .prepare(
        "UPDATE platform_payment_checkouts SET provider_id=NULL,state='uncertain' WHERE id=?",
      )
      .bind(checkout.id)
      .run()
    const { reconcileDodoSubscription } =
      await import('../packages/platform/src/dodo-payments.ts')
    await assert.rejects(
      reconcileDodoSubscription(
        f.db,
        root,
        'test',
        sub.subscription_id,
        undefined,
        f.transport,
        f.now + 1000,
        sub.metadata.chronoframe_profile_id,
      ),
      { code: 'payment_checkout_mismatch' },
    )
    assert.equal(sub.status, 'cancelled')
    const stored = await f.db
      .prepare('SELECT state,error FROM platform_payment_checkouts WHERE id=?')
      .bind(checkout.id)
      .first<any>()
    assert.equal(stored.state, 'expired')
    assert.equal(stored.error, 'payment_checkout_mismatch')
    const { requireNoHandover } =
      await import('../packages/platform/src/payment-handover.ts')
    await requireNoHandover(f.db, 1)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT expires_at FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).expires_at,
      f.originalEnd,
    )
  } finally {
    await f.mf.dispose()
  }
})

for (const outcome of [
  'failed',
  'cancelled',
  'requires_payment_method',
  'requires_confirmation',
])
  test(`unpaid ${outcome} with a pending subscription closes an expired checkout and releases the purchase slot`, async () => {
    const f = await fixture()
    try {
      await syncDodoProducts(f.db, root, f.transport)
      const checkout = await createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        origin,
        f.transport,
        f.now,
      )
      const { payment, sub } = await f.paid(checkout)
      payment.status = outcome
      payment.service_periods = []
      sub.status = 'pending'
      const later = f.now + 86400001
      assert.equal(
        (
          await refreshDodoCheckout(
            f.db,
            root,
            1,
            1,
            checkout.id,
            f.transport,
            later,
          )
        ).state,
        'expired',
      )
      assert.equal(sub.status, 'cancelled')
      assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
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
            .prepare(
              'SELECT source FROM platform_workspace_plans WHERE workspace_id=1',
            )
            .first<any>()
        ).source,
        'default',
      )
      const next = await createPaymentCheckout(
        f.db,
        root,
        1,
        input('after_expired'),
        origin,
        f.transport,
        later + 1000,
      )
      assert.notEqual(next.id, checkout.id)
    } finally {
      await f.mf.dispose()
    }
  })
test('a failed linked payment closes without waiting for the checkout age limit', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { payment, sub } = await f.paid(checkout)
    payment.status = 'cancelled'
    sub.status = 'pending'
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        )
      ).state,
      'expired',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
  } finally {
    await f.mf.dispose()
  }
})
test('old processing and actionable payments are never canceled on checkout age alone', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { payment, sub } = await f.paid(checkout)
    sub.status = 'pending'
    for (const state of [
      'processing',
      'requires_customer_action',
      'requires_capture',
      'partially_captured',
      'partially_captured_and_capturable',
    ]) {
      payment.status = state
      await assert.rejects(
        refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 86400001,
        ),
        { code: 'payment_confirmation_pending' },
      )
      assert.equal(sub.status, 'pending')
      assert.equal(
        f.calls.some(
          (c) => c.method === 'PATCH' && c.url.includes('/subscriptions/'),
        ),
        false,
      )
      assert.ok((await paymentStatus(f.db, 1, 1)).pending)
    }
  } finally {
    await f.mf.dispose()
  }
})
test('a deferred checkout with a failed pending subscription expires without authorizing or extending entitlements', async () => {
  const f = await handoverFixture()
  try {
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...input(), startMode: 'after_entitlement' },
      origin,
      f.transport,
      f.now,
    )
    const { payment, sub, session } = await f.paid(checkout)
    sub.trial_period_days = session.trial_period_days
    sub.status = 'pending'
    payment.status = 'failed'
    payment.total_amount = 0
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        )
      ).state,
      'expired',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).reservation, null)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT expires_at FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).expires_at,
      f.originalEnd,
    )
  } finally {
    await f.mf.dispose()
  }
})

test('an expired session without a payment also releases uncertain checkouts, without discarding late payment recovery', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    await f.db
      .prepare(
        "UPDATE platform_payment_checkouts SET state='uncertain' WHERE id=?",
      )
      .bind(checkout.id)
      .run()
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 86400001,
        )
      ).state,
      'expired',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
    const { sub } = await f.paid(checkout)
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 2000,
        )
      ).state,
      'completed',
    )
    assert.equal(sub.status, 'active')
  } finally {
    await f.mf.dispose()
  }
})
test('unconfirmed provider cancellation and mismatched failed payments never release a checkout', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { payment, sub } = await f.paid(checkout)
    payment.status = 'failed'
    sub.status = 'pending'
    const noCancel: typeof fetch = async (url, init) =>
      init?.method === 'PATCH'
        ? Response.json({ ...sub })
        : f.transport(url, init)
    await assert.rejects(
      refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        noCancel,
        f.now + 1000,
      ),
      { code: 'payment_confirmation_pending' },
    )
    assert.ok((await paymentStatus(f.db, 1, 1)).pending)
    payment.customer = { customer_id: 'different_customer' }
    const calls = f.calls.length
    await assert.rejects(
      refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 2000,
      ),
      { code: 'payment_customer_mismatch' },
    )
    assert.ok(!f.calls.slice(calls).some((c) => c.method === 'PATCH'))
    assert.ok((await paymentStatus(f.db, 1, 1)).pending)
  } finally {
    await f.mf.dispose()
  }
})

test('lost checkout update fences reject closure and a later reconciliation can converge', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { payment, sub } = await f.paid(checkout)
    payment.status = 'failed'
    sub.status = 'pending'
    const row = await f.db
      .prepare('SELECT * FROM platform_payment_checkouts WHERE id=?')
      .bind(checkout.id)
      .first<any>()
    const client = {
      subscriptions: {
        update: async () => {
          sub.status = 'cancelled'
        },
        retrieve: async () => sub,
      },
    }
    const { closeFailedInitialCheckout } =
      await import('../packages/platform/src/unpaid-checkout.ts')
    await assert.rejects(
      closeFailedInitialCheckout(
        f.db,
        client,
        row,
        sub,
        payment,
        null,
        f.now,
        '0=1',
        [],
      ),
      { code: 'payment_entitlement_changed' },
    )
    assert.equal(sub.status, 'cancelled')
    assert.equal(
      (
        await f.db
          .prepare('SELECT state FROM platform_payment_checkouts WHERE id=?')
          .bind(checkout.id)
          .first<any>()
      ).state,
      'open',
    )
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        )
      ).state,
      'inactive',
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
    assert.equal(
      (
        await f.db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_subscriptions')
          .first<any>()
      ).n,
      0,
    )
  } finally {
    await f.mf.dispose()
  }
})

for (const state of ['requires_payment_method', 'requires_confirmation'])
  test(`manual cancellation of ${state} ends pending checkout and permits a fresh link before the age limit`, async () => {
    const f = await fixture()
    try {
      await syncDodoProducts(f.db, root, f.transport)
      const checkout = await createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        origin,
        f.transport,
        f.now,
      )
      const { sub, payment } = await f.paid(checkout)
      sub.status = 'pending'
      payment.status = state
      assert.equal(
        (
          await refreshDodoCheckout(
            f.db,
            root,
            1,
            1,
            checkout.id,
            f.transport,
            f.now + 1000,
          )
        ).state,
        'awaiting_payment',
      )
      const pending = (await paymentStatus(f.db, 1, 1)).pending
      assert.equal(pending.canCancel, 1)
      assert.equal(pending.url, null)
      const { cancelDodoCheckout } =
        await import('../packages/platform/src/dodo-payments.ts')
      await assert.rejects(
        cancelDodoCheckout(
          f.db,
          root,
          2,
          1,
          checkout.id,
          f.transport,
          f.now + 2000,
        ),
        { code: 'workspace_admin_required' },
      )
      assert.equal(
        (
          await cancelDodoCheckout(
            f.db,
            root,
            1,
            1,
            checkout.id,
            f.transport,
            f.now + 2000,
          )
        ).state,
        'expired',
      )
      assert.equal(sub.status, 'cancelled')
      assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
      assert.equal(
        (
          await f.db
            .prepare(
              'SELECT source FROM platform_workspace_plans WHERE workspace_id=1',
            )
            .first<any>()
        ).source,
        'default',
      )
      await cancelDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 3000,
      )
      const next = await createPaymentCheckout(
        f.db,
        root,
        1,
        input('explicit_retry'),
        origin,
        f.transport,
        f.now + 4000,
      )
      assert.notEqual(next.url, checkout.url)
    } finally {
      await f.mf.dispose()
    }
  })
test('manual cancellation never cancels processing or successful payments and requires verified revocation', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { sub, payment } = await f.paid(checkout)
    sub.status = 'pending'
    const { cancelDodoCheckout } =
      await import('../packages/platform/src/dodo-payments.ts')
    for (const state of [
      'processing',
      'requires_customer_action',
      'requires_capture',
    ]) {
      payment.status = state
      const calls = f.calls.length
      await assert.rejects(
        cancelDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        ),
        { code: 'payment_cancellation_unavailable' },
      )
      assert.ok(!f.calls.slice(calls).some((c) => c.method === 'PATCH'))
    }
    payment.status = 'requires_payment_method'
    const denied: typeof fetch = async (url, init) =>
      init?.method === 'PATCH' ? Response.json(sub) : f.transport(url, init)
    await assert.rejects(
      cancelDodoCheckout(f.db, root, 1, 1, checkout.id, denied, f.now + 1000),
      { code: 'payment_cancellation_unavailable' },
    )
    assert.ok((await paymentStatus(f.db, 1, 1)).pending)
    sub.status = 'active'
    payment.status = 'succeeded'
    const calls = f.calls.length
    await assert.rejects(
      cancelDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 2000,
      ),
      { code: 'payment_cancellation_unavailable' },
    )
    assert.ok(!f.calls.slice(calls).some((c) => c.method === 'PATCH'))
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT source FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).source,
      'payment',
    )
  } finally {
    await f.mf.dispose()
  }
})
test('details-stage cancellation releases the local slot and preserves late payment recovery', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { cancelDodoCheckout } =
      await import('../packages/platform/src/dodo-payments.ts')
    assert.equal((await paymentStatus(f.db, 1, 1)).pending.canCancel, 1)
    await cancelDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 1000,
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).pending, null)
    const abandoned = await f.db
      .prepare('SELECT * FROM platform_payment_checkouts WHERE id=?')
      .bind(checkout.id)
      .first<any>()
    assert.equal(abandoned.state, 'expired')
    assert.equal(abandoned.error, 'payment_checkout_abandoned')
    assert.equal(abandoned.checkout_url, null)
    assert.ok(abandoned.provider_id)
    // Retain reconciliation for a real payment through an old browser tab.
    await f.paid(checkout)
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 2000,
    )
    const grant = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.equal(grant.source, 'payment')
  } finally {
    await f.mf.dispose()
  }
})
test('unpaid deferred authorization can be canceled without extending the original entitlement', async () => {
  const f = await handoverFixture()
  try {
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...input(), startMode: 'after_entitlement' },
      origin,
      f.transport,
      f.now,
    )
    const { sub, payment, session } = await f.paid(checkout)
    sub.status = 'pending'
    sub.trial_period_days = session.trial_period_days
    payment.status = 'requires_payment_method'
    payment.total_amount = 0
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        )
      ).state,
      'awaiting_payment',
    )
    const { cancelDodoCheckout } =
      await import('../packages/platform/src/dodo-payments.ts')
    assert.equal(
      (
        await cancelDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 2000,
        )
      ).state,
      'expired',
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT expires_at FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).expires_at,
      f.originalEnd,
    )
    assert.equal((await paymentStatus(f.db, 1, 1)).reservation, null)
  } finally {
    await f.mf.dispose()
  }
})

function coupon(
  payment: any,
  productId: string,
  type = 'percentage',
  amount = 2000,
  position = 0,
) {
  payment.business_id = 'bus_fixture'
  return {
    discount_id: 'dsc_fixture_' + position,
    business_id: payment.business_id,
    code: 'SAVE' + position,
    type,
    amount,
    position,
    restricted_to: [productId],
  }
}
for (const kind of [
  'percentage',
  'flat',
  'stacked',
  'free',
  'adaptive',
  'taxed',
])
  test(`hosted checkout coupons fulfill verified ${kind} invoices without changing catalog prices`, async () => {
    const f = await fixture()
    try {
      await syncDodoProducts(f.db, root, f.transport)
      const checkout = await createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        origin,
        f.transport,
        f.now,
      )
      const request = f.calls.find(
        (c) => new URL(c.url).pathname === '/checkouts' && c.method === 'POST',
      )!
      assert.equal(request.body.feature_flags.allow_discount_code, true)
      const { payment, sub } = await f.paid(checkout)
      const paid = payment as any
      paid.discounts = [
        coupon(
          paid,
          sub.product_id,
          kind === 'flat' ? 'flat' : 'percentage',
          kind === 'free' ? 10000 : 2000,
        ),
      ]
      paid.total_amount = kind === 'free' ? 0 : kind === 'flat' ? 1000 : 960
      if (kind === 'stacked') {
        paid.discounts.push(coupon(paid, sub.product_id, 'flat', 100, 1))
        paid.total_amount = 860
      }
      if (kind === 'adaptive') {
        paid.currency = 'CNY'
        paid.total_amount = 6800
        paid.settlement_currency = 'USD'
        paid.settlement_amount = 960
      }
      if (kind === 'taxed') paid.tax = 160
      if (kind === 'free') {
        paid.service_periods = []
        paid.charge_type = 'new'
      }
      assert.equal(
        (
          await refreshDodoCheckout(
            f.db,
            root,
            1,
            1,
            checkout.id,
            f.transport,
            f.now + 1000,
          )
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
      assert.equal(
        (
          await f.db
            .prepare('SELECT price FROM platform_payment_checkouts WHERE id=?')
            .bind(checkout.id)
            .first<any>()
        ).price,
        1200,
      )
      assert.equal(
        (
          await f.db
            .prepare("SELECT monthly_price FROM platform_plans WHERE id='pro'")
            .first<any>()
        ).monthly_price,
        1200,
      )
    } finally {
      await f.mf.dispose()
    }
  })
test('coupon scope, business and invoice mismatches cannot fulfill discounted payments; legacy checkouts stay strict', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { payment, sub } = await f.paid(checkout),
      paid = payment as any
    paid.total_amount = 600
    const valid = coupon(paid, sub.product_id)
    for (const invalid of [
      [],
      [{ ...valid, restricted_to: ['other_product'] }],
      [{ ...valid, business_id: 'other_business' }],
      [{ ...valid, position: 2 }],
      [{ ...valid, type: 'unknown' }],
    ]) {
      paid.discounts = invalid
      await assert.rejects(
        refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        ),
        { code: 'payment_amount_mismatch' },
      )
    }
    paid.discounts = [valid]
    for (const lines of [
      {
        currency: 'USD',
        items: [{ items_id: 'wrong_product', amount: 600, tax: 0 }],
      },
      {
        currency: 'USD',
        items: [{ items_id: sub.product_id, amount: 500, tax: 0 }],
      },
      {
        currency: 'EUR',
        items: [{ items_id: sub.product_id, amount: 600, tax: 0 }],
      },
    ]) {
      paid.lineItems = lines
      await assert.rejects(
        refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          f.now + 1000,
        ),
        { code: 'payment_amount_mismatch' },
      )
    }
    delete paid.lineItems
    await f.db
      .prepare(
        'UPDATE platform_payment_checkouts SET coupon_enabled=0 WHERE id=?',
      )
      .bind(checkout.id)
      .run()
    await assert.rejects(
      refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 1000,
      ),
      { code: 'payment_amount_mismatch' },
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
  } finally {
    await f.mf.dispose()
  }
})

test('coupons combine with catalog discounts, renew at the billed amount, then expire back to the base contract', async () => {
  const f = await fixture()
  try {
    await f.db
      .prepare(
        "UPDATE platform_plans SET monthly_discount_bps=1000,revision=revision+1 WHERE id='pro'",
      )
      .run()
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { sub, payment } = await f.paid(checkout),
      paid = payment as any
    paid.discounts = [coupon(paid, sub.product_id)]
    paid.total_amount = 864
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 1000,
    )
    const initial = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    const { reconcileDodoSubscription } =
      await import('../packages/platform/src/dodo-payments.ts')
    for (const [index, total, discounted] of [
      [1, 0, true],
      [2, 1080, false],
    ] as const) {
      const start = f.now + index * 28 * 86400000,
        end = start + 28 * 86400000
      sub.previous_billing_date = new Date(start).toISOString()
      sub.next_billing_date = new Date(end).toISOString()
      const renewal = {
        ...paid,
        payment_id: 'pay_coupon_cycle_' + index,
        charge_type: 'renewal',
        total_amount: total,
        discounts: discounted
          ? [coupon(paid, sub.product_id, 'percentage', 10000)]
          : [],
        created_at: new Date(start).toISOString(),
        service_periods: discounted
          ? []
          : [
              {
                subscription_id: sub.subscription_id,
                starts_at: sub.previous_billing_date,
                ends_at: sub.next_billing_date,
              },
            ],
      }
      f.payments.set(renewal.payment_id, renewal)
      await reconcileDodoSubscription(
        f.db,
        root,
        'test',
        sub.subscription_id,
        renewal.payment_id,
        f.transport,
        start + 1000,
        'dodo_test',
      )
      const grant = await f.db
        .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
        .first<any>()
      assert.equal(grant.expires_at, end)
      assert.equal(grant.starts_at, initial.starts_at)
    }
  } finally {
    await f.mf.dispose()
  }
})
test('a zero-dollar coupon is not a trial payment; it activates only at the reserved paid-cycle boundary', async () => {
  const f = await handoverFixture()
  try {
    const { checkout, sub, payment, at } = await authorizeHandover(f)
    const auth = payment as any
    auth.discounts = [coupon(auth, sub.product_id, 'percentage', 10000)]
    auth.charge_type = 'new'
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 2000,
    )
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT source FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).source,
      'activation',
    )
    sub.previous_billing_date = new Date(at).toISOString()
    sub.next_billing_date = new Date(at + 28 * 86400000).toISOString()
    const renewal = {
      ...auth,
      payment_id: 'pay_free_first_cycle',
      charge_type: 'renewal',
      created_at: new Date(at).toISOString(),
      service_periods: [],
    }
    f.payments.set(renewal.payment_id, renewal)
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          at + 1000,
        )
      ).state,
      'completed',
    )
    const grant = await f.db
      .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
      .first<any>()
    assert.equal(grant.source, 'payment')
    assert.equal(grant.starts_at, at)
    assert.equal(grant.expires_at, at + 28 * 86400000)
  } finally {
    await f.mf.dispose()
  }
})

test('refunded coupon payments revoke only their linked grant without fetching refund-sensitive invoice details', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { sub, payment } = await f.paid(checkout),
      paid = payment as any
    paid.discounts = [coupon(paid, sub.product_id)]
    paid.total_amount = 960
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      f.transport,
      f.now + 1000,
    )
    paid.refunds = [{ refund_id: 'ref_coupon', status: 'succeeded' }]
    const noLines: typeof fetch = async (url, init) => {
      if (String(url).includes('/line-items'))
        assert.fail('a refund must not depend on line-item retrieval')
      return f.transport(url, init)
    }
    await refreshDodoCheckout(
      f.db,
      root,
      1,
      1,
      checkout.id,
      noLines,
      f.now + 2000,
    )
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

test('a late trial authorization with a 100% coupon cannot become a paid cycle after the old entitlement expires', async () => {
  const f = await handoverFixture()
  try {
    await f.db
      .prepare(
        'UPDATE platform_workspace_plans SET expires_at=? WHERE workspace_id=1',
      )
      .bind(f.now + 6 * 3600000)
      .run()
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      { ...input(), startMode: 'after_entitlement' },
      origin,
      f.transport,
      f.now,
    )
    const { sub, payment, session } = await f.paid(checkout),
      auth = payment as any
    const authorizedAt = f.now + 12 * 3600000,
      startsPaidAt = authorizedAt + 86400000
    sub.trial_period_days = session.trial_period_days
    sub.previous_billing_date = new Date(authorizedAt).toISOString()
    sub.next_billing_date = new Date(startsPaidAt).toISOString()
    auth.total_amount = 0
    auth.charge_type = 'new'
    auth.service_periods = []
    auth.created_at = sub.previous_billing_date
    auth.discounts = [coupon(auth, sub.product_id, 'percentage', 10000)]
    assert.equal(
      (
        await refreshDodoCheckout(
          f.db,
          root,
          1,
          1,
          checkout.id,
          f.transport,
          authorizedAt + 1000,
        )
      ).state,
      'scheduled',
    )
    const ledger = await f.db
      .prepare(
        'SELECT activation_state,handover_at FROM platform_payment_subscriptions',
      )
      .first<any>()
    assert.equal(ledger.activation_state, 'authorized')
    assert.equal(ledger.handover_at, startsPaidAt)
    assert.equal(
      (
        await f.db
          .prepare(
            'SELECT source FROM platform_workspace_plans WHERE workspace_id=1',
          )
          .first<any>()
      ).source,
      'activation',
    )
  } finally {
    await f.mf.dispose()
  }
})

for (const providerStatus of ['cancelled', 'expired'] as const) {
  test(`known discounted ${providerStatus} subscription revokes access without line-item availability`, async () => {
    const f = await fixture()
    try {
      await syncDodoProducts(f.db, root, f.transport)
      const checkout = await createPaymentCheckout(
        f.db,
        root,
        1,
        input(),
        origin,
        f.transport,
        f.now,
      )
      const { sub, payment } = await f.paid(checkout),
        paid = payment as any
      paid.discounts = [coupon(paid, sub.product_id)]
      paid.total_amount = 960
      await refreshDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 1000,
      )
      const before = await f.db
        .prepare(
          'SELECT * FROM platform_payment_subscriptions WHERE checkout_id=?',
        )
        .bind(checkout.id)
        .first<any>()
      assert.equal(before.status, 'active')
      sub.status = providerStatus
      let lineRequests = 0
      const unavailable: typeof fetch = async (url, options) => {
        if (String(url).includes('/line-items')) {
          lineRequests++
          return Response.json({ message: 'Unavailable' }, { status: 503 })
        }
        return f.transport(url, options)
      }
      const { reconcileDodoSubscription } =
        await import('../packages/platform/src/dodo-payments.ts')
      await reconcileDodoSubscription(
        f.db,
        root,
        'test',
        sub.subscription_id,
        paid.payment_id,
        unavailable,
        f.now + 2000,
        'dodo_test',
      )
      const after = await f.db
        .prepare(
          'SELECT * FROM platform_payment_subscriptions WHERE checkout_id=?',
        )
        .bind(checkout.id)
        .first<any>()
      assert.equal(lineRequests, 0)
      assert.equal(
        after.status,
        providerStatus === 'cancelled' ? 'canceled' : providerStatus,
      )
      assert.equal(after.period_end, before.period_end)
      const grant = await f.db
        .prepare('SELECT * FROM platform_workspace_plans WHERE workspace_id=1')
        .first<any>()
      assert.equal(grant.source, 'expired_default')
      assert.equal(grant.plan_id, 'free')
    } finally {
      await f.mf.dispose()
    }
  })
}

test('details-stage abandonment requires a fresh empty provider session and no reconciliation lock', async () => {
  const f = await fixture()
  try {
    await syncDodoProducts(f.db, root, f.transport)
    const checkout = await createPaymentCheckout(
      f.db,
      root,
      1,
      input(),
      origin,
      f.transport,
      f.now,
    )
    const { cancelDodoCheckout } =
      await import('../packages/platform/src/dodo-payments.ts')
    const session = f.sessions.get(checkout.url.split('/').pop()!)!
    session.payment_status = 'processing'
    await assert.rejects(
      cancelDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 1000,
      ),
      { code: 'payment_cancellation_unavailable' },
    )
    session.payment_status = null
    const unavailable: typeof fetch = async () =>
      Response.json({}, { status: 503 })
    await assert.rejects(
      cancelDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        unavailable,
        f.now + 1000,
      ),
    )
    await f.db
      .prepare(
        'INSERT INTO platform_payment_locks(workspace_id,token,expires_at) VALUES(1,?,?)',
      )
      .bind('in-flight', f.now + 60000)
      .run()
    await assert.rejects(
      cancelDodoCheckout(
        f.db,
        root,
        1,
        1,
        checkout.id,
        f.transport,
        f.now + 1000,
      ),
      { code: 'payment_cancellation_unavailable' },
    )
    const row = await f.db
      .prepare(
        'SELECT state,checkout_url FROM platform_payment_checkouts WHERE id=?',
      )
      .bind(checkout.id)
      .first<any>()
    assert.equal(row.state, 'open')
    assert.equal(row.checkout_url, checkout.url)
    assert.ok((await paymentStatus(f.db, 1, 1)).pending)
  } finally {
    await f.mf.dispose()
  }
})
