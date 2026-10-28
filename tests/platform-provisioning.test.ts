import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import {
  createD1Provisioning,
  siteIdentity,
  type PlatformD1,
} from '../packages/platform/src/index.ts'
import { siteProfile } from '../packages/platform/src/provisioning.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

test('Site identity rejects reserved, malformed and ambiguous addresses', () => {
  for (const slug of [
    'app',
    'admin',
    'chronoframe',
    'UPPER',
    'a',
    'ab',
    '-abc',
    'abc-',
    'a.b',
    'a/b',
    'a'.repeat(41),
  ])
    assert.throws(() => siteIdentity('Gallery', slug))
  for (const name of ['', ' ', 'a'.repeat(81), 'bad\nname'])
    assert.throws(() => siteIdentity(name, 'valid-site'))
  assert.deepEqual(siteIdentity(' My gallery ', 'valid-site'), {
    name: 'My gallery',
    slug: 'valid-site',
  })
})

test('Real D1 provisioning preserves old tenants, serializes defaults and enforces admin, uniqueness and revisions', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-22',
      script: 'export default {fetch(){return new Response("test")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    async function migrate(name: string) {
      const sql = await readFile(
        new URL('../packages/platform/migrations/' + name, import.meta.url),
        'utf8',
      )
      for (const s of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(s).run()
    }
    await migrate('0001_platform.sql')
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at) VALUES(42,'old@example.com',1),(43,'other@example.com',1),(44,'pending@example.com',1)",
      )
      .run()
    await db
      .prepare("INSERT INTO platform_workspaces VALUES(7,'Original workspace')")
      .run()
    await db
      .prepare("INSERT INTO platform_sites VALUES(8,7,'Original gallery',1)")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_memberships VALUES(42,7,'admin'),(43,7,'member')",
      )
      .run()
    await migrate('0002_visitor_access.sql')
    await migrate('0003_account_security.sql')
    await migrate('0004_workspace_sites.sql')
    await migrate('0011_site_identity.sql')
    await migrate('0013_custom_domains.sql')
    for (const migration of [
      '0005_media_catalog.sql',
      '0006_cloud_execution.sql',
      '0007_cloud_storage.sql',
      '0009_cloud_usage_events.sql',
      '0014_entitlements.sql',
      '0015_lifecycle.sql',
      '0016_gallery_presentation.sql',
      '0017_subscriptions.sql',
      '0019_signup_promotions.sql',
    ])
      await migrate(migration)
    await db
      .prepare(
        `UPDATE platform_plans SET policy_json=json_set(policy_json,'$.limits.sites',10) WHERE id='free'`,
      )
      .run()
    await db
      .prepare('UPDATE platform_users SET email_verified=0 WHERE id=44')
      .run()
    const store = createD1Provisioning(db as PlatformD1)
    const defaults = await Promise.all(
      Array.from({ length: 6 }, () => store.defaultWorkspace(42)),
    )
    assert.equal(new Set(defaults.map((w) => w.id)).size, 1)
    assert.equal(defaults[0].role, 'admin')
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_workspaces WHERE owner_user_id=42',
          )
          .first()
      ).n,
      1,
    )
    await assert.rejects(store.defaultWorkspace(44), { statusCode: 403 })
    await assert.rejects(store.defaultWorkspace(999), { statusCode: 403 })
    assert.equal((await store.get(42, 8)).name, 'Original gallery')
    assert.equal((await store.get(43, 8)).role, 'member')
    assert.equal((await store.get(42, 8)).published, 1)
    await assert.rejects(
      store.update(43, 8, { name: 'Hijack', published: false, revision: 1 }),
      { statusCode: 403 },
    )
    const input = {
      name: 'First gallery',
      slug: 'first-gallery',
      requestId: crypto.randomUUID(),
    }
    const first = await store.create(42, input)
    assert.equal(first.published, 1)
    assert.equal((await store.create(42, input)).siteId, first.siteId)
    await assert.rejects(store.create(42, { ...input, name: 'Changed' }), {
      statusCode: 409,
    })
    await assert.rejects(store.get(43, first.siteId), { statusCode: 404 })
    await assert.rejects(
      store.update(43, first.siteId, {
        name: 'Hijack',
        published: false,
        revision: 1,
      }),
      { statusCode: 404 },
    )
    await assert.rejects(
      store.create(43, { ...input, requestId: crypto.randomUUID() }),
      { statusCode: 409 },
    )
    const updated = await store.update(42, first.siteId, {
      name: 'Renamed',
      published: false,
      revision: 1,
    })
    assert.equal(updated.revision, 2)
    await assert.rejects(
      store.update(42, first.siteId, {
        name: 'Stale',
        published: false,
        revision: 1,
      }),
      { statusCode: 409 },
    )
    assert.equal(
      (
        await store.update(42, first.siteId, {
          name: 'Renamed',
          published: true,
          revision: 2,
        })
      ).published,
      1,
    )
    const races = await Promise.allSettled(
      [42, 43].map((id) =>
        store.create(id, {
          name: 'Race',
          slug: 'one-address',
          requestId: crypto.randomUUID(),
        }),
      ),
    )
    assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1)
    // Newly created empty galleries publish without changing existing gallery settings.
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_domains d JOIN platform_sites s ON s.id=d.site_id WHERE s.published=1 AND d.active=1',
          )
          .first()
      ).n,
      2,
    )
    assert.equal((await store.get(42, 8)).published, 1)
    const oldUpdated = await store.update(42, 8, {
      name: 'Original renamed',
      published: true,
      revision: 1,
    })
    assert.equal(oldUpdated.published, 1)
    assert.equal(
      (
        await store.update(42, 8, {
          name: 'Original renamed',
          published: false,
          revision: 2,
        })
      ).published,
      0,
    )
    const profile = {
      title: 'Public title',
      slogan: 'Small moments',
      author: 'Photographer',
      avatarUrl: 'data:image/png;base64,AA==',
    }
    const profiled = await store.update(42, 8, {
      name: 'Workspace name',
      published: false,
      revision: 3,
      profile,
      presentation: {
        homeHeaderLayout: 'fixed',
        socialLinks: {
          links: [
            'https://github.com/example',
            'https://example.com/portfolio',
          ],
        },
      },
    })
    assert.deepEqual(profiled.presentation, {
      homeHeaderLayout: 'fixed',
      socialLinks: {
        links: ['https://github.com/example', 'https://example.com/portfolio'],
      },
    })
    assert.equal(profiled.title, profile.title)
    assert.equal((await store.get(42, 8)).avatarUrl, profile.avatarUrl)
    const preserved = await store.update(42, 8, {
      name: 'Renamed workspace',
      published: false,
      revision: 4,
    })
    assert.equal(
      preserved.title,
      profile.title,
      'legacy clients preserve public profile',
    )
    assert.deepEqual(
      preserved.presentation,
      profiled.presentation,
      'legacy updates retain gallery presentation',
    )
    for (const presentation of [
      { homeHeaderLayout: 'invalid', socialLinks: { links: [] } },
      { homeHeaderLayout: ['fixed'], socialLinks: { links: [] } },
      {
        homeHeaderLayout: 'fixed',
        socialLinks: { links: ['javascript:alert(1)'] },
      },
      {
        homeHeaderLayout: 'fixed',
        socialLinks: {
          links: ['https://github.com/example', 'https://github.com/example/'],
        },
      },
      {
        homeHeaderLayout: 'fixed',
        socialLinks: { links: Array(5).fill('https://example.com') },
      },
    ]) {
      await assert.rejects(
        store.update(42, 8, {
          name: 'Must not change',
          published: true,
          revision: 5,
          presentation,
        }),
        { statusCode: 400 },
      )
    }
    assert.equal((await store.get(42, 8)).name, preserved.name)

    await assert.rejects(
      store.update(42, 8, {
        name: 'Stale',
        published: false,
        revision: 4,
        profile: { ...profile, title: 'Lost update' },
      }),
      { statusCode: 409 },
    )
    await assert.rejects(
      store.update(43, 8, {
        name: 'Member edit',
        published: false,
        revision: 5,
        profile,
      }),
      { statusCode: 403 },
    )
    await assert.rejects(
      store.update(44, 8, {
        name: 'Foreign',
        published: false,
        revision: 5,
        profile,
      }),
      { statusCode: 404 },
    )
    assert.equal((await store.get(42, 8)).title, profile.title)
    // The pilot bound is enforced in the INSERT, including parallel writes.
    await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) =>
        store.create(42, {
          name: 'Draft ' + i,
          slug: 'limited-' + i,
          requestId: crypto.randomUUID(),
        }),
      ),
    )
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_sites WHERE workspace_id=?',
          )
          .bind(first.workspaceId)
          .first()
      ).n,
      10,
    )
    await db
      .prepare(
        'DELETE FROM platform_memberships WHERE user_id=42 AND workspace_id=?',
      )
      .bind(first.workspaceId)
      .run()
    await assert.rejects(store.defaultWorkspace(42), { statusCode: 403 })
    await assert.rejects(store.get(42, first.siteId), { statusCode: 404 })
    assert.equal(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS n FROM platform_memberships WHERE user_id=42 AND workspace_id=?',
          )
          .bind(first.workspaceId)
          .first()
      ).n,
      0,
    )
  } finally {
    await mf.dispose()
  }
})

test('Gallery identity accepts bounded plain text and raster data only', () => {
  const profile = { title: ' Gallery ', slogan: '', author: '', avatarUrl: '' }
  assert.equal(siteProfile(profile).title, 'Gallery')
  for (const avatarUrl of [
    'javascript:alert(1)',
    'https://127.0.0.1/icon',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'x'.repeat(65537),
  ])
    assert.throws(() => siteProfile({ ...profile, avatarUrl }), {
      statusCode: 400,
    })
  for (const title of ['x'.repeat(81), 'bad\nvalue'])
    assert.throws(() => siteProfile({ ...profile, title }), { statusCode: 400 })
})
