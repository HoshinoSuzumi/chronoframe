import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  paymentProviders,
  savePaymentProvider,
  selectPaymentProvider,
  openProviderCredentials,
} from '../packages/platform/src/payment-providers.ts'
import {
  paymentSettings,
  creemRequest,
  receivePaymentEvent,
  processPaymentEvents,
  reconcilePayments,
  refreshPaymentCheckout,
  recoverPaymentCheckout,
  createPaymentPortal,
  createPaymentCheckout,
  closeAccountPayments,
} from '../packages/platform/src/payments.ts'
import {
  syncPaymentProducts,
  queuePaymentProductSync,
} from '../packages/platform/src/payment-product-sync.ts'
import { pricingCatalog } from '../packages/platform/src/billing.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
const key = 'provider-test-root-secret-'.repeat(3)
async function fixture(upgrade = false) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  const db = await mf.getD1Database('DB')
  for (const file of (
    await readdir(new URL('../packages/platform/migrations/', import.meta.url))
  )
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (upgrade && file === '0028_payment_providers.sql')
      await db
        .prepare(
          "UPDATE platform_payment_settings SET enabled=1,purchase_method='activation_code',auto_sync=1,credentials_ciphertext='legacy-encrypted-envelope' WHERE id=1",
        )
        .run()
    for (const q of (
      await readFile(
        new URL('../packages/platform/migrations/' + file, import.meta.url),
        'utf8',
      )
    )
      .replace(/^--.*$/gm, '')
      .match(/\s*CREATE TRIGGER[\s\S]+?END;|[^;]+;/g) ?? [])
      await db.prepare(q).run()
  }
  await db
    .prepare(
      'CREATE TABLE platform_admin_audit(id TEXT PRIMARY KEY,actor_id INTEGER,action TEXT,target TEXT,reason TEXT,after_json TEXT,created_at INTEGER)',
    )
    .run()
  return { mf, db }
}
test('provider profiles are isolated, encrypted, redacted, audited and revision protected', async () => {
  const { mf, db } = await fixture()
  try {
    const input = {
      id: 'stripe',
      name: 'Stripe',
      environment: 'test',
      revision: 0,
      reason: 'Configure provider',
      credentials: {
        apiKey: 'secret-stripe-value',
        webhookSecret: 'secret-webhook-value',
      },
    }
    await savePaymentProvider(db, key, 1, input)
    await savePaymentProvider(db, key, 1, {
      ...input,
      id: 'paddle',
      name: 'Paddle',
      credentials: { apiKey: 'secret-paddle-value' },
    })
    await assert.rejects(savePaymentProvider(db, key, 1, input), {
      code: 'payment_revision_conflict',
    })
    const row = await db
      .prepare("SELECT * FROM platform_payment_providers WHERE id='stripe'")
      .first<any>()
    assert.ok(!row.credentials_ciphertext.includes(input.credentials.apiKey))
    assert.deepEqual(
      await openProviderCredentials(
        key,
        'stripe',
        'test',
        row.credentials_ciphertext,
      ),
      input.credentials,
    )
    await assert.rejects(
      openProviderCredentials(
        key,
        'paddle',
        'test',
        row.credentials_ciphertext,
      ),
    )
    await savePaymentProvider(db, key, 1, {
      ...input,
      credentials: undefined,
      revision: 1,
      environment: 'live',
    })
    const changed = await db
      .prepare("SELECT * FROM platform_payment_providers WHERE id='stripe'")
      .first<any>()
    assert.deepEqual(
      await openProviderCredentials(
        key,
        'stripe',
        'live',
        changed.credentials_ciphertext,
      ),
      input.credentials,
    )
    await assert.rejects(
      openProviderCredentials(
        key,
        'stripe',
        'test',
        changed.credentials_ciphertext,
      ),
      { name: 'OperationError' },
    )
    const safe = JSON.stringify({
      providers: await paymentProviders(db),
      audit: (await db.prepare('SELECT * FROM platform_admin_audit').all())
        .results,
    })
    assert.ok(!safe.includes('secret-stripe-value'))
    assert.ok(!safe.includes('secret-paddle-value'))
    assert.ok(!safe.includes('credentials_ciphertext'))
    let settings = await paymentSettings(db)
    await selectPaymentProvider(db, 1, {
      id: 'stripe',
      revision: settings.revision,
      reason: 'Select provider',
    })
    assert.equal((await paymentSettings(db)).currentProvider, 'stripe')
    await assert.rejects(
      selectPaymentProvider(db, 1, {
        id: 'paddle',
        revision: settings.revision,
        reason: 'Stale selection',
      }),
      { code: 'payment_revision_conflict' },
    )
    settings = await paymentSettings(db)
    await selectPaymentProvider(db, 1, {
      id: 'paddle',
      revision: settings.revision,
      reason: 'Switch provider',
    })
    assert.equal((await paymentSettings(db)).currentProvider, 'paddle')
    await assert.rejects(
      savePaymentProvider(db, key, 1, { ...input, id: 'creem' }),
      { code: 'payment_provider_retired' },
    )
    for (const enabled of [0, 1]) {
      for (const mode of ['payment', 'activation_code']) {
        await db
          .prepare(
            'UPDATE platform_payment_settings SET enabled=?,purchase_method=?',
          )
          .bind(enabled, mode)
          .run()
        const catalog = await pricingCatalog(db)
        assert.equal(catalog.purchaseMethod, enabled ? mode : 'activation_code')
        assert.equal(catalog.paymentAvailable, false)
      }
    }
  } finally {
    await mf.dispose()
  }
})
test('retired Creem entry points never call providers or mutate the historical ledger, including when disabled', async () => {
  const { mf, db } = await fixture()
  let calls = 0
  const transport: typeof fetch = async () => {
    calls++
    throw Error('Unexpected network')
  }
  try {
    const before = JSON.stringify(
      (await db.prepare('SELECT * FROM platform_payment_product_sync').all())
        .results,
    )
    for (const enabled of [0, 1]) {
      await db
        .prepare('UPDATE platform_payment_settings SET enabled=?,auto_sync=1')
        .bind(enabled)
        .run()
      await queuePaymentProductSync(db)
      assert.deepEqual(await syncPaymentProducts(db, key, transport), {
        processed: 0,
      })
      await reconcilePayments(db, key, transport)
      await processPaymentEvents(db, key, transport)
      for (const action of [
        () =>
          creemRequest(
            { apiKey: 'creem_test_old', webhookSecret: 'old' },
            '/v1/products',
            undefined,
            transport,
          ),
        () => receivePaymentEvent(db, key, new Uint8Array(), ''),
        () => refreshPaymentCheckout(db, key, 1, 1, 'old', transport),
        () => recoverPaymentCheckout(db, key, 'old', 'checkout_old', transport),
        () => createPaymentPortal(db, key, 1, 1, transport),
        () =>
          createPaymentCheckout(
            db,
            key,
            1,
            { workspaceId: 1, planId: 'pro', interval: 1, requestId: 'old' },
            'https://portal.invalid',
            transport,
          ),
      ])
        await assert.rejects(action(), { code: 'payment_provider_retired' })
      assert.equal(await closeAccountPayments(db, key, 1, transport), true)
    }
    assert.equal(calls, 0)
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_payment_events')
          .first<any>()
      ).n,
      0,
    )
    assert.equal(
      JSON.stringify(
        (await db.prepare('SELECT * FROM platform_payment_product_sync').all())
          .results,
      ),
      before,
    )
  } finally {
    await mf.dispose()
  }
})

test('upgrade preserves purchase controls and the legacy encrypted profile while stopping synchronization', async () => {
  const { mf, db } = await fixture(true)
  try {
    const settings = await paymentSettings(db)
    assert.equal(settings.currentProvider, 'creem')
    assert.equal(settings.enabled, true)
    assert.equal(settings.purchaseMethod, 'activation_code')
    assert.equal(settings.providerAvailable, false)
    assert.equal(settings.autoSync, false)
    const profile = await db
      .prepare("SELECT * FROM platform_payment_providers WHERE id='creem'")
      .first<any>()
    assert.equal(profile.credentials_ciphertext, 'legacy-encrypted-envelope')
    assert.equal((await paymentProviders(db))[0].status, 'retired')
  } finally {
    await mf.dispose()
  }
})
