import { splitSqlQuery } from './helpers/sql.ts'
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
  activationHash,
  normalizeActivationCode,
  previewActivation as previewWithLimit,
  redeemActivation as redeemWithLimit,
} from '../packages/platform/src/activation.ts'
import {
  pricingCatalog,
  workspaceBilling,
} from '../packages/platform/src/billing.ts'
const require = createRequire(import.meta.url),
  { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve('wrangler/package.json'),
  )('miniflare')
// Each business scenario gets an isolated rate budget; the limiter itself is
// exercised separately below against real concurrent D1 requests.
async function previewActivation(db: any, userId: number, ...args: any[]) {
  await db
    .prepare('DELETE FROM platform_activation_attempts WHERE user_id=?')
    .bind(userId)
    .run()
  return (previewWithLimit as any)(db, userId, ...args)
}
async function redeemActivation(db: any, userId: number, ...args: any[]) {
  await db
    .prepare('DELETE FROM platform_activation_attempts WHERE user_id=?')
    .bind(userId)
    .run()
  return (redeemWithLimit as any)(db, userId, ...args)
}
test('Activation codes generate 12 alphanumeric characters and normalize custom and legacy identities', async () => {
  const batch = await generateActivationCodes(
    { count: 500, planId: 'free', duration: { unit: 'days', value: 1 } },
    1,
  )
  assert.equal(new Set(batch.codes.map((c) => c.code)).size, 500)
  assert.ok(batch.codes.every((c) => /^[A-Z0-9]{12}$/.test(c.code)))
  const custom = await generateActivationCodes(
    {
      count: 1,
      planId: 'free',
      duration: { unit: 'days', value: 1 },
      code: ' launch-春,2026! ',
    },
    1,
  )
  assert.equal(custom.codes[0]!.code, 'LAUNCH-春,2026!')
  assert.equal(
    await activationHash(' launch-春,2026! '),
    await activationHash('LAUNCH-春,2026!'),
  )
  const canonical = 'CF' + 'A1'.repeat(16),
    formatted = 'CF-' + 'a1'.repeat(16).match(/.{4}/g)!.join('-')
  const legacyDigest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  )
  assert.equal(
    await activationHash(formatted),
    Array.from(new Uint8Array(legacyDigest), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join(''),
  )
  assert.equal(normalizeActivationCode('a-b'), 'A-B')
  assert.notEqual(await activationHash('A-B'), await activationHash('AB'))
  await assert.rejects(
    generateActivationCodes(
      {
        count: 2,
        planId: 'free',
        duration: { unit: 'days', value: 1 },
        code: 'Manual',
      },
      1,
    ),
    { code: 'invalid_code_batch' },
  )
  assert.throws(() => normalizeActivationCode('a\nb'))
  assert.throws(() => normalizeActivationCode('a'.repeat(129)))
})
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
      for (const sql of splitSqlQuery(
        (
          await readFile('packages/platform/migrations/' + file, 'utf8')
        ).replace(/^--.*$/gm, ''),
      )
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
    assert.ok(catalog.plans.every((p) => p.featured === false))
    await db
      .prepare("UPDATE platform_plans SET featured=1 WHERE id='pro'")
      .run()
    assert.equal(
      (await pricingCatalog(db)).plans.find((p) => p.featured)!.id,
      'pro',
    )
    await assert.rejects(
      db
        .prepare("UPDATE platform_plans SET featured=1 WHERE id='starter'")
        .run(),
      /UNIQUE/,
    )
    await db
      .prepare("UPDATE platform_plans SET featured=0 WHERE id='pro'")
      .run()
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
    assert.equal(result.grant.expiresAt, addMonths(now, 2))
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
    // A plan disabled before its paid expiry must retain a current quota anchor.
    await db
      .prepare(
        "UPDATE platform_billing_settings SET expiry_plan_id='free' WHERE id=1",
      )
      .run()
    await db
      .prepare(
        "UPDATE platform_workspace_plans SET plan_id='pro',starts_at=?,expires_at=?,source='activation',revision=revision+1 WHERE workspace_id=?",
      )
      .bind(now, addMonths(now, 3), one.id)
      .run()
    await db.prepare("UPDATE platform_plans SET active=0 WHERE id='pro'").run()
    const disabled = await resolveSubscription(db, one.id, now)
    assert.equal(disabled.id, 'free')
    assert.equal(disabled.quotaPeriod.start, now)
    assert.equal(
      (await workspaceBilling(db, 1, one.id, now)).usage.monthlyBytes,
      123,
    )
    await reconcileSubscriptions(db, now)
    assert.equal(
      (await resolveSubscription(db, one.id, now)).quotaPeriod.start,
      now,
    )
    assert.equal(
      (await workspaceBilling(db, 1, one.id, now)).usage.monthlyBytes,
      123,
    )
    // Even a manually corrupted inactive fallback cannot monopolize the bounded queue.
    await db.prepare("UPDATE platform_plans SET active=0 WHERE id='free'").run()
    await reconcileSubscriptions(db, now)
    assert.equal((await reconcileSubscriptions(db, now)).changed, 0)
    await db
      .prepare("UPDATE platform_plans SET active=1 WHERE id='starter'")
      .run()
    const genuine = await db
      .prepare(
        "INSERT INTO platform_workspaces(name) VALUES('Genuinely expired') RETURNING id",
      )
      .first<{ id: number }>()
    await db
      .prepare(
        "INSERT INTO platform_workspace_plans(workspace_id,plan_id,starts_at,expires_at,source) VALUES(?,'starter',?,?,'manual')",
      )
      .bind(genuine!.id, now - 1000, now - 1)
      .run()
    assert.equal((await reconcileSubscriptions(db, now, 1)).changed, 1)
    assert.equal(
      (await resolveSubscription(db, genuine!.id, now)).subscription.source,
      'default',
    )
    await db.prepare("UPDATE platform_plans SET active=1 WHERE id='free'").run()
    // Change the assignment after preflight but before the atomic claim statement.
    await db.prepare("UPDATE platform_plans SET active=1 WHERE id='pro'").run()
    const racedCode = await code(null),
      stale = await resolveSubscription(db, one.id, now)
    const racingDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: any[]) => {
        await db
          .prepare(
            'UPDATE platform_workspace_plans SET revision=revision+1 WHERE workspace_id=?',
          )
          .bind(one.id)
          .run()
        return db.batch(statements)
      },
    }
    await assert.rejects(
      () =>
        redeemActivation(
          racingDb,
          1,
          one.id,
          {
            code: racedCode.code,
            revision: stale.assignment_revision,
            requestId: crypto.randomUUID(),
          },
          now,
        ),
      { code: 'subscription_changed' },
    )
    assert.equal(
      (
        await db
          .prepare('SELECT uses FROM platform_activation_codes WHERE id=?')
          .bind(racedCode.id)
          .first()
      ).uses,
      0,
    )
    const rateWindow = now + 9000000
    for (let i = 0; i < 3; i++)
      await assert.rejects(
        () => previewWithLimit(db, 1, one.id, 'invalid-code', rateWindow),
        (error: any) => error.code === 'invalid_activation_code',
      )
    await assert.rejects(
      () => previewWithLimit(db, 1, one.id, 'invalid-code', rateWindow),
      (error: any) => error.code === 'activation_rate_limit',
    )
    await assert.rejects(
      () =>
        previewWithLimit(db, 1, one.id, 'invalid-code', rateWindow + 900000),
      (error: any) => error.code === 'invalid_activation_code',
    )
    const parallel = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        previewWithLimit(db, 1, one.id, 'invalid-code', rateWindow + 1800000),
      ),
    )
    assert.equal(
      parallel.filter((r: any) => r.reason?.code === 'invalid_activation_code')
        .length,
      3,
    )
    assert.equal(
      parallel.filter((r: any) => r.reason?.code === 'activation_rate_limit')
        .length,
      3,
    )
    assert.deepEqual(
      await redeemWithLimit(db, 1, one.id, input, rateWindow + 1800000),
      duplicate[0],
      'a successful receipt retry does not consume the exhausted budget',
    )
  } finally {
    await mf.dispose()
  }
})
