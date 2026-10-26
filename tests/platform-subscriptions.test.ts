import { createDomainManager } from '../packages/platform/src/domains.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  createD1Provisioning,
  createD1Directory,
} from '../packages/platform/src/index.ts'
import {
  workspaceEntitlements,
  FREE_LIMITS,
} from '../packages/platform/src/entitlements.ts'
import {
  addMonths,
  extendDurationEnd,
  monthlyPeriod,
  resolveSubscription,
  reconcileSubscriptions,
} from '../packages/platform/src/subscriptions.ts'
import {
  generateActivationCodes,
  previewActivation,
  redeemActivation,
} from '../packages/platform/src/activation.ts'
import {
  pricingCatalog,
  workspaceBilling,
} from '../packages/platform/src/billing.ts'
const require = createRequire(import.meta.url),
  { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve('wrangler/package.json'),
  )('miniflare')
test('Calendar subscription periods clamp UTC month ends without multiplying stock quotas', () => {
  const jan = Date.UTC(2024, 0, 31, 12)
  assert.equal(addMonths(jan, 1), Date.UTC(2024, 1, 29, 12))
  assert.equal(addMonths(jan, 3), Date.UTC(2024, 3, 30, 12))
  assert.equal(
    extendDurationEnd(jan, addMonths(jan, 1), { unit: 'months', value: 1 }),
    Date.UTC(2024, 2, 31, 12),
  )
  assert.deepEqual(monthlyPeriod(jan, Date.UTC(2024, 2, 15)), {
    start: Date.UTC(2024, 1, 29, 12),
    end: Date.UTC(2024, 2, 31, 12),
  })
})
test('Real D1 defaults, live expiry, activation races/idempotency and workspace usage share one entitlement source', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      for (const sql of (
        await readFile('packages/platform/migrations/' + file, 'utf8')
      )
        .replace(/^--.*$/gm, '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(sql).run()
    const now = Date.now()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,email_verified,created_at,updated_at) VALUES(1,'one@example.com',1,?,?),(2,'two@example.com',1,?,?),(3,'three@example.com',1,?,?)",
      )
      .bind(now, now, now, now, now, now)
      .run()
    await db
      .prepare(
        "INSERT INTO platform_plans(id,name,policy_json,monthly_price,quarterly_price) VALUES('pro','Pro',?,900,2400),('starter','Starter',?,0,0)",
      )
      .bind(
        JSON.stringify({
          limits: { ...FREE_LIMITS, sites: 10, customDomains: 3 },
          rules: [],
        }),
        JSON.stringify({ limits: { ...FREE_LIMITS, sites: 2 }, rules: [] }),
      )
      .run()
    const store = createD1Provisioning(db),
      one = await store.defaultWorkspace(1)
    assert.equal((await workspaceEntitlements(db, one.id)).id, 'free')
    await db
      .prepare(
        "UPDATE platform_billing_settings SET new_plan_id='pro',expiry_plan_id='starter' WHERE id=1",
      )
      .run()
    const two = await store.defaultWorkspace(2),
      three = await store.defaultWorkspace(3)
    assert.equal((await workspaceEntitlements(db, two.id)).id, 'pro')
    assert.equal(
      (await workspaceEntitlements(db, one.id)).id,
      'free',
      'changing signup default does not change existing grants',
    )
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='pro',expires_at=?,source='manual' WHERE workspace_id=?",
      )
      .bind(now - 1, one.id)
      .run()
    assert.equal(
      (await workspaceEntitlements(db, one.id)).id,
      'starter',
      'live reads expire before scheduler runs',
    )
    await reconcileSubscriptions(db, now)
    assert.equal(
      (
        await db
          .prepare(
            'SELECT plan_id FROM platform_workspace_plans WHERE workspace_id=?',
          )
          .bind(one.id)
          .first()
      ).plan_id,
      'starter',
    )
    await db
      .prepare(
        "UPDATE platform_billing_settings SET expiry_plan_id='free' WHERE id=1",
      )
      .run()
    assert.equal(
      (await workspaceEntitlements(db, one.id)).id,
      'free',
      'persisted expiry followers honor later default changes',
    )
    await db
      .prepare(
        "UPDATE platform_billing_settings SET expiry_plan_id='starter' WHERE id=1",
      )
      .run()
    const catalog = await pricingCatalog(db)
    assert.equal(catalog.paymentAvailable, false)
    assert.equal(
      catalog.plans.find((p) => p.id === 'pro')!.quarterlyPrice,
      2400,
    )
    async function code(maxUses: number | null = 1, planId = 'pro') {
      const batch = await generateActivationCodes(
        { count: 1, planId, duration: { unit: 'months', value: 1 }, maxUses },
        1,
        now,
      )
      const c = batch.codes[0]!
      await db
        .prepare(
          'INSERT INTO platform_activation_codes(id,code_hash,display,batch_id,plan_id,duration_unit,duration_value,redeem_until,max_uses,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          c.id,
          c.hash,
          c.display,
          c.batchId,
          c.planId,
          c.duration.unit,
          c.duration.value ?? null,
          c.redeemUntil,
          c.maxUses,
          now,
          1,
        )
        .run()
      return c
    }
    // Default grants may be replaced by a finite activation grant without being considered a paid permanent grant.
    const first = await code(),
      preview = await previewActivation(db, 1, one.id, first.code, now),
      requestId = crypto.randomUUID()
    const input = { code: first.code, requestId, revision: preview.revision }
    const duplicate = await Promise.all([
      redeemActivation(db, 1, one.id, input, now),
      redeemActivation(db, 1, one.id, input, now),
    ])
    assert.deepEqual(duplicate[0], duplicate[1])
    assert.equal(
      (
        await db
          .prepare('SELECT uses FROM platform_activation_codes WHERE id=?')
          .bind(first.id)
          .first()
      ).uses,
      1,
    )
    assert.equal((await workspaceEntitlements(db, one.id)).id, 'pro')
    await assert.rejects(previewActivation(db, 1, one.id, first.code, now), {
      code: 'invalid_activation_code',
    })
    const extension = await code(null)
    const extended = await previewActivation(db, 1, one.id, extension.code, now)
    assert.equal(extended.grant.mode, 'extend')
    const result = await redeemActivation(
      db,
      1,
      one.id,
      {
        code: extension.code,
        revision: extended.revision,
        requestId: crypto.randomUUID(),
      },
      now,
    )
    assert.equal(result.grant.expiresAt, addMonths(addMonths(now, 1), 1))
    assert.equal(result.grant.startsAt, now)
    const shared = await code(1)
    const a = await previewActivation(db, 2, two.id, shared.code, now),
      b = await previewActivation(db, 3, three.id, shared.code, now)
    const race = await Promise.allSettled([
      redeemActivation(
        db,
        2,
        two.id,
        {
          code: shared.code,
          revision: a.revision,
          requestId: crypto.randomUUID(),
        },
        now,
      ),
      redeemActivation(
        db,
        3,
        three.id,
        {
          code: shared.code,
          revision: b.revision,
          requestId: crypto.randomUUID(),
        },
        now,
      ),
    ])
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(
      (
        await db
          .prepare('SELECT uses FROM platform_activation_codes WHERE id=?')
          .bind(shared.id)
          .first()
      ).uses,
      1,
    )
    // No private audit/receipt/grant may survive a failed final event write.
    const rollback = await code(null)
    const prior = await resolveSubscription(db, one.id, now)
    await db
      .prepare(
        "CREATE TRIGGER fail_grant_event BEFORE INSERT ON platform_subscription_events BEGIN SELECT RAISE(ABORT,'forced event failure'); END",
      )
      .run()
    await assert.rejects(
      redeemActivation(
        db,
        1,
        one.id,
        {
          code: rollback.code,
          revision: prior.assignment_revision,
          requestId: crypto.randomUUID(),
        },
        now,
      ),
    )
    await db.prepare('DROP TRIGGER fail_grant_event').run()
    assert.equal(
      (
        await db
          .prepare('SELECT uses FROM platform_activation_codes WHERE id=?')
          .bind(rollback.id)
          .first()
      ).uses,
      0,
    )
    assert.equal(
      (await resolveSubscription(db, one.id, now)).assignment_revision,
      prior.assignment_revision,
    )
    const unrestricted = await code(null)
    const snapshots = await Promise.all([
      resolveSubscription(db, two.id, now),
      resolveSubscription(db, three.id, now),
    ])
    const allUsers = await Promise.all([
      redeemActivation(
        db,
        2,
        two.id,
        {
          code: unrestricted.code,
          revision: snapshots[0]!.assignment_revision,
          requestId: crypto.randomUUID(),
        },
        now,
      ),
      redeemActivation(
        db,
        3,
        three.id,
        {
          code: unrestricted.code,
          revision: snapshots[1]!.assignment_revision,
          requestId: crypto.randomUUID(),
        },
        now,
      ),
    ])
    assert.equal(allUsers.length, 2)
    assert.equal(
      (
        await db
          .prepare('SELECT uses FROM platform_activation_codes WHERE id=?')
          .bind(unrestricted.id)
          .first()
      ).uses,
      2,
    )
    const deadline = await code(null)
    await db
      .prepare('UPDATE platform_activation_codes SET redeem_until=? WHERE id=?')
      .bind(now, deadline.id)
      .run()
    await assert.rejects(previewActivation(db, 1, one.id, deadline.code, now), {
      code: 'invalid_activation_code',
    })
    await db
      .prepare(
        "INSERT INTO platform_memberships(user_id,workspace_id,role) VALUES(1,?,'admin')",
      )
      .bind(two.id)
      .run()
    await assert.rejects(
      previewActivation(db, 1, two.id, first.code, now),
      { code: 'invalid_activation_code' },
      'one redemption per user across workspaces',
    )
    const emptyDefault = await store.create(1, {
      name: 'Billing gallery',
      slug: 'billing-gallery',
      requestId: crypto.randomUUID(),
    })
    await db
      .prepare(
        "INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at,state) VALUES(?,'billing-upload',1,'billing-upload','1','ledger-only','test/key',123,?,'completed')",
      )
      .bind(emptyDefault.siteId, now + 1000)
      .run()
    await db
      .prepare(
        'INSERT INTO cloud_usage_events(site_id,upload_id,bytes,created_at) VALUES(?,?,?,?)',
      )
      .bind(emptyDefault.siteId, 'billing-upload', 123, now)
      .run()
    const measured = await workspaceBilling(db, 1, one.id, now)
    assert.equal(
      measured.usage.monthlyBytes,
      123,
      'events exactly at the quota start are included',
    )
    const inactive = await code(null, 'starter')
    await db
      .prepare("UPDATE platform_plans SET active=0 WHERE id='starter'")
      .run()
    await assert.rejects(previewActivation(db, 1, one.id, inactive.code, now), {
      code: 'invalid_activation_code',
    })
    assert.equal(
      (
        await db
          .prepare('SELECT uses FROM platform_activation_codes WHERE id=?')
          .bind(inactive.id)
          .first()
      ).uses,
      0,
    )
    const usage = await workspaceBilling(db, 1, one.id, now)
    assert.equal(usage.usage.sites, 1)
    assert.equal(usage.usage.storageBytes, 0)
    assert.equal(usage.plan.limits.sites, 10)
    await assert.rejects(workspaceBilling(db, 2, one.id), {
      code: 'workspace_unavailable',
    })
    assert.equal(
      (await workspaceBilling(db, 1, one.id, addMonths(now, 1))).usage
        .monthlyBytes,
      0,
      'monthly usage resets even within a longer term',
    )
    await db
      .prepare(
        "INSERT INTO platform_custom_domains(hostname,site_id,generation,state,verified_at,provider_id,route_id,provider_attempted,route_attempted,created_at,expires_at,next_check_at) VALUES('paid.example.com',?,'code-billing-domain','active',?,'provider-1','route-1',1,1,?,9999999999999,0)",
      )
      .bind(emptyDefault.siteId, now, now)
      .run()
    await db
      .prepare(
        "INSERT INTO platform_domains(hostname,site_id,verified,active,kind) VALUES('paid.example.com',?,1,1,'custom')",
      )
      .bind(emptyDefault.siteId)
      .run()
    await db
      .prepare(
        'UPDATE platform_workspace_plans SET expires_at=?,revision=revision+1 WHERE workspace_id=?',
      )
      .bind(now - 1, one.id)
      .run()
    assert.equal(
      await createD1Directory(db).getPublishedSiteByHost('paid.example.com'),
      null,
      'expired custom-domain rights stop public traffic immediately',
    )
    await reconcileSubscriptions(db, now)
    let billable = true,
      route = true
    const controller = createDomainManager(
      db,
      {
        enabled: true,
        routingReady: true,
        baseDomain: 'chronoframe.art',
        cnameTarget: 'cname.chronoframe.art',
        limit: 20,
      },
      {
        now: () => now,
        dns: async () => 'ready',
        id: () => crypto.randomUUID(),
        provider: {
          count: async () => (billable ? 1 : 0),
          find: async () =>
            billable
              ? { id: 'provider-1', status: 'active', ssl: 'active' }
              : null,
          get: async () =>
            billable
              ? { id: 'provider-1', status: 'active', ssl: 'active' }
              : null,
          create: async () => {
            billable = true
            return { id: 'provider-1', status: 'active', ssl: 'active' }
          },
          retry: async () => {},
          remove: async () => {
            billable = false
          },
          findRoute: async () =>
            route ? { id: 'route-1', owned: true } : null,
          createRoute: async () => {
            route = true
            return 'route-1'
          },
          removeRoute: async () => {
            route = false
          },
        },
      },
    )
    await controller.reconcile('paid.example.com')
    assert.equal(billable, false)
    assert.equal(route, false)
    const quota = (await resolveSubscription(db, one.id, now)).quotaPeriod
    assert.equal(quota.start, now - 1)
    const rateWindow = now + 9000000
    for (let i = 0; i < 20; i++)
      await assert.rejects(
        () => previewActivation(db, 1, one.id, 'invalid-code', rateWindow),
        (error: any) => error.code === 'invalid_activation_code',
      )
    await assert.rejects(
      () => previewActivation(db, 1, one.id, 'invalid-code', rateWindow),
      (error: any) => error.code === 'activation_rate_limit',
    )
    await assert.rejects(
      () =>
        previewActivation(db, 1, one.id, 'invalid-code', rateWindow + 900000),
      (error: any) => error.code === 'invalid_activation_code',
    )
  } finally {
    await mf.dispose()
  }
})
