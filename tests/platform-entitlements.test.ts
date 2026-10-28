import { splitSqlQuery } from './helpers/sql.ts'
import {
  createDomainManager,
  renameDefaultDomain,
  type DomainProvider,
} from '../packages/platform/src/domains.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import {
  FREE_LIMITS,
  validatePolicy,
  evaluatePolicy,
  workspaceEntitlements,
  workspaceUsageSQL,
} from '../packages/platform/src/entitlements.ts'
import {
  createD1Provisioning,
  createD1Directory,
} from '../packages/platform/src/index.ts'
import { createStorageVault } from '../packages/platform/src/storage-vault.ts'
import { createStorageCipher } from '../packages/storage/src/credential-cipher.ts'
const require = createRequire(import.meta.url),
  { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve('wrangler/package.json'),
  )('miniflare')
test('Plan rules compose ordered conditions without executable expressions or unbounded trees', () => {
  const p = validatePolicy({
    limits: FREE_LIMITS,
    rules: [
      {
        when: {
          all: [
            { field: 'emailVerified', op: 'eq', value: true },
            {
              any: [
                { field: 'workspaceAgeDays', op: 'gte', value: 30 },
                { field: 'storageMode', op: 'eq', value: 'byos' },
              ],
            },
          ],
        },
        limits: { sites: 2, byos: 1 },
      },
      {
        when: { field: 'storageMode', op: 'eq', value: 'platform' },
        limits: { storageBytes: 2 * 1073741824 },
      },
    ],
  })
  assert.equal(
    evaluatePolicy(p, {
      storageMode: 'platform',
      workspaceAgeDays: 0,
      emailVerified: true,
    }).sites,
    1,
  )
  assert.equal(
    evaluatePolicy(p, {
      storageMode: 'platform',
      workspaceAgeDays: 30,
      emailVerified: true,
    }).sites,
    2,
  )
  assert.equal(
    evaluatePolicy(p, {
      storageMode: 'platform',
      workspaceAgeDays: 30,
      emailVerified: true,
    }).storageBytes,
    2147483648,
  )
  for (const value of [
    { limits: { ...FREE_LIMITS, sites: -1 }, rules: [] },
    {
      limits: FREE_LIMITS,
      rules: [
        {
          when: { field: '__proto__', op: 'eq', value: true },
          limits: { sites: 5 },
        },
      ],
    },
    {
      limits: FREE_LIMITS,
      rules: [{ when: { all: [] }, limits: { sites: 5 } }],
    },
    { limits: { ...FREE_LIMITS, byos: 2 }, rules: [] },
  ])
    assert.throws(() => validatePolicy(value))
})
test('New workspaces are free; empty galleries auto-publish; quotas and managed credentials stay isolated', async () => {
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
    for (const f of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      for (const q of splitSqlQuery(
        (await readFile('packages/platform/migrations/' + f, 'utf8')).replace(
          /^--.*$/gm,
          '',
        ),
      )
        .map((v) => v.trim())
        .filter(Boolean))
        await db.prepare(q).run()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at,email_verified) VALUES(1,'one@example.com',?,1),(2,'two@example.com',?,1)",
      )
      .bind(Date.now(), Date.now())
      .run()
    const provision = createD1Provisioning(db),
      directory = createD1Directory(db)
    const results = await Promise.allSettled(
      ['one-a', 'one-b'].map((slug) =>
        provision.create(1, {
          name: slug,
          slug,
          requestId: crypto.randomUUID(),
        }),
      ),
    )
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const one = results.find((r) => r.status === 'fulfilled')!.value
    assert.equal(one.published, 1)
    assert.equal(
      (await directory.getPublishedSiteByHost(one.slug + '.chronoframe.art'))
        ?.id,
      one.siteId,
    )
    const free = await workspaceEntitlements(db, one.workspaceId, 'platform')
    assert.deepEqual(free.limits, FREE_LIMITS)
    const manager = createDomainManager(
      db,
      {
        enabled: true,
        routingReady: true,
        baseDomain: 'chronoframe.art',
        cnameTarget: 'cname.chronoframe.art',
        limit: 20,
      },
      {
        dns: async () => 'ready',
        id: () => crypto.randomUUID(),
        provider: new Proxy(
          {},
          {
            get() {
              return () => {
                throw new Error(
                  'Free tier must not allocate provider resources',
                )
              }
            },
          },
        ) as DomainProvider,
      },
    )
    await assert.rejects(manager.request(1, one.siteId, 'photos.example.com'), {
      statusCode: 403,
      code: 'domain_limit',
    })
    await db
      .prepare(
        `UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.customDomains',3) WHERE id='free'`,
      )
      .run()
    const domain = await manager.request(1, one.siteId, 'existing.example.com')
    const two = await provision.create(2, {
      name: 'Two',
      slug: 'two-site',
      requestId: crypto.randomUUID(),
    })
    const cipher = await createStorageCipher('test-'.repeat(10)),
      vault = createStorageVault(db, one.siteId, cipher)
    const config = {
        endpoint: 'https://s3.amazonaws.com',
        bucket: 'private-test',
        region: 'us-east-1',
      },
      credentials = {
        accessKeyId: 'example-access',
        secretAccessKey: 'example-private',
      }
    const sealed = await cipher.seal(
      credentials,
      JSON.stringify(['platform-storage', 'main', 1]),
    )
    await db.batch([
      db
        .prepare(
          "INSERT INTO platform_storage_pools(id,name,enabled,checked_at) VALUES('main','Main',1,?)",
        )
        .bind(Date.now()),
      db
        .prepare(
          "INSERT INTO platform_storage_pool_versions VALUES('main',1,?,?)",
        )
        .bind(JSON.stringify(config), sealed),
    ])
    await vault.attachPool('main', Date.now())
    const list = await vault.list()
    assert.equal(list[0].config.bucket, 'Platform storage')
    assert.ok(!JSON.stringify(list).includes('private-test'))
    assert.ok(!JSON.stringify(list).includes('example-private'))
    assert.deepEqual(
      (await vault.resolve('platform-main'))?.credentials,
      credentials,
    )
    assert.equal(
      await createStorageVault(db, two.siteId, cipher).resolve('platform-main'),
      null,
    )
    await assert.rejects(
      vault.rotate('platform-main', 1, credentials, Date.now()),
      { statusCode: 403 },
    )
    await db
      .prepare("UPDATE platform_storage_pools SET enabled=0 WHERE id='main'")
      .run()
    assert.ok(await vault.resolve('platform-main'))
    assert.equal((await vault.list())[0].uploads_enabled, 0)
    assert.equal(
      await createStorageVault(db, two.siteId, cipher).attachPool(
        'main',
        Date.now(),
      ),
      null,
    )
    await db
      .prepare('UPDATE platform_sites SET suspended=1 WHERE id=?')
      .bind(one.siteId)
      .run()
    assert.equal(
      await directory.getPublishedSiteByHost(one.slug + '.chronoframe.art'),
      null,
    )
    for (const action of [
      'pause',
      'resume',
      'delete',
      'check',
      'primary',
      'redirects',
    ] as const)
      await assert.rejects(
        manager.mutate(
          1,
          one.siteId,
          domain.hostname,
          domain.generation,
          domain.revision,
          action,
        ),
        { statusCode: 404 },
      )
    await assert.rejects(manager.defaultPrimary(1, one.siteId), {
      statusCode: 404,
    })
    await assert.rejects(
      manager.request(1, one.siteId, 'blocked.example.com'),
      { statusCode: 404 },
    )
    await assert.rejects(
      renameDefaultDomain(db, 1, one.siteId, {
        slug: 'blocked-rename',
        revision: one.revision,
      }),
      { statusCode: 403 },
    )
    const audits = (
      await db
        .prepare('SELECT COUNT(*) AS n FROM platform_domain_audit')
        .first()
    ).n
    const racedDb = {
      prepare: (query: string) => db.prepare(query),
      batch: async (statements: any[]) => {
        await db
          .prepare('UPDATE platform_sites SET suspended=1 WHERE id=?')
          .bind(one.siteId)
          .run()
        return db.batch(statements)
      },
    }
    const racedManager = createDomainManager(
      racedDb,
      {
        enabled: true,
        routingReady: true,
        baseDomain: 'chronoframe.art',
        cnameTarget: 'cname.chronoframe.art',
        limit: 20,
      },
      {
        dns: async () => 'ready',
        id: () => crypto.randomUUID(),
        provider: {} as DomainProvider,
      },
    )
    await db
      .prepare('UPDATE platform_sites SET suspended=0 WHERE id=?')
      .bind(one.siteId)
      .run()
    await assert.rejects(
      racedManager.request(1, one.siteId, 'raced.example.com'),
    )
    assert.equal(
      await db
        .prepare(
          "SELECT hostname FROM platform_custom_domains WHERE hostname='raced.example.com'",
        )
        .first(),
      null,
    )
    await db
      .prepare('UPDATE platform_sites SET suspended=0 WHERE id=?')
      .bind(one.siteId)
      .run()
    await assert.rejects(
      renameDefaultDomain(racedDb, 1, one.siteId, {
        slug: 'raced-rename',
        revision: one.revision,
      }),
      { statusCode: 409 },
    )
    assert.equal(
      (
        await db
          .prepare('SELECT slug FROM platform_sites WHERE id=?')
          .bind(one.siteId)
          .first()
      ).slug,
      one.slug,
    )
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_domain_audit')
          .first()
      ).n,
      audits,
    )
    const expr = workspaceUsageSQL(one.siteId),
      now = Date.now()
    // One write both checks capacity and reserves it; two simultaneous uploads cannot overspend.
    const reserve = (id: string) =>
      db
        .prepare(
          `INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at,reserved_storage_bytes) SELECT ?,?,1,?,'1','platform-main',?,700,?,700 WHERE ${expr.storage}+700<=1024`,
        )
        .bind(one.siteId, id, id, 'objects/' + id, now + 60000, now)
        .run()
    const admissions = await Promise.all([
      reserve('upload-a'),
      reserve('upload-b'),
    ])
    assert.equal(
      admissions.reduce((n, r) => n + r.meta.changes, 0),
      1,
    )
    const usage = await db
      .prepare(`SELECT ${expr.storage} AS bytes`)
      .bind(now)
      .first()
    assert.equal(usage.bytes, 700)
    // Cancellation releases reserved capacity without altering the other tenant.
    await db
      .prepare("UPDATE cloud_uploads SET state='cancelled' WHERE site_id=?")
      .bind(one.siteId)
      .run()
    assert.equal(
      (await db.prepare(`SELECT ${expr.storage} AS bytes`).bind(now).first())
        .bytes,
      0,
    )
  } finally {
    await mf.dispose()
  }
})
