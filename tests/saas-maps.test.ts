import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  EMPTY_MAP,
  parsePublicMap,
  siteMaps,
  saveSiteMaps,
} from '../packages/platform/src/maps.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
test('public map defaults, per-site overrides, membership and optimistic revisions stay isolated', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
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
        .match(/\s*CREATE TRIGGER[\s\S]+?END;|[^;]+;/g) ?? [])
        await db.prepare(sql).run()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at) VALUES(1,'one@example.com',1),(2,'two@example.com',1)",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_workspaces(id,name) VALUES(1,'One'),(2,'Two')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_memberships VALUES(1,1,'admin'),(2,1,'member'),(2,2,'admin')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name) VALUES(1,1,'One'),(2,2,'Two')",
      )
      .run()
    const defaults = { ...EMPTY_MAP, 'maplibre.token': 'public_default_key' }
    await db
      .prepare('UPDATE platform_map_settings SET config_json=? WHERE id=1')
      .bind(JSON.stringify(defaults))
      .run()
    assert.deepEqual((await siteMaps(db, 1)).effective, defaults)
    const own = {
      ...EMPTY_MAP,
      provider: 'mapbox',
      'mapbox.token': 'pk.public_browser_token',
    }
    const saved = await saveSiteMaps(db, 1, 1, { revision: 0, config: own })
    assert.equal(saved.revision, 1)
    assert.deepEqual(saved.effective, own)
    assert.deepEqual((await siteMaps(db, 2)).effective, defaults)
    await assert.rejects(
      saveSiteMaps(db, 2, 1, { revision: 1, config: null }),
      { statusCode: 409 },
    )
    await assert.rejects(saveSiteMaps(db, 1, 2, { revision: 0, config: own }), {
      statusCode: 409,
    })
    await assert.rejects(
      saveSiteMaps(db, 1, 1, { revision: 0, config: null }),
      { statusCode: 409 },
    )
    assert.deepEqual(
      (await saveSiteMaps(db, 1, 1, { revision: 1, config: null })).effective,
      defaults,
    )
    assert.throws(
      () =>
        parsePublicMap({ ...own, 'mapbox.token': 'sk.secret_server_token' }),
      { code: 'map_public_token_required' },
    )
    assert.throws(
      () => parsePublicMap({ ...own, 'maplibre.style': 'javascript:alert(1)' }),
      { code: 'map_style_invalid' },
    )
    assert.throws(
      () =>
        parsePublicMap({
          ...own,
          'maplibre.style': 'https://user:password@example.com/style',
        }),
      { code: 'map_style_invalid' },
    )
  } finally {
    await mf.dispose()
  }
})
