import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import {
  createCloudAlbumWithSlug,
  resolveCloudAlbumPath,
} from '../packages/database/src/cloud-album-slugs.ts'
import { updateCloudAlbum } from '../apps/cloud/server/utils/cloud-album-editor.ts'
import type { PlatformD1 } from '../packages/platform/src/index.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

test('Real D1 album slugs share normalization, reserve history/tombstones and isolate Sites with atomic revision guards', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-25',
      script: 'export default {fetch(){return new Response("test")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = await readFile('packages/platform/migrations/' + file, 'utf8')
      for (const statement of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run()
    }
    await db
      .prepare(
        "INSERT INTO platform_workspaces(id,name) VALUES(1,'One'),(2,'Two')",
      )
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'One',1),(2,2,'Two',1)",
      )
      .run()
    assert.equal(
      await createCloudAlbumWithSlug(db, 1, '1', '你好 World'),
      'ni-hao-world',
    )
    assert.equal(
      await createCloudAlbumWithSlug(db, 1, '2', 'Beta', { slug: 'beta' }),
      'beta',
    )
    assert.equal(
      await createCloudAlbumWithSlug(db, 2, '1', 'Foreign', {
        slug: 'ni-hao-world',
      }),
      'ni-hao-world',
    )
    await db
      .prepare(
        "INSERT INTO cloud_albums(site_id,id,title) VALUES(1,'3','Legacy')",
      )
      .run()
    assert.equal((await resolveCloudAlbumPath(db, 1, '0003'))?.slug, 'legacy')
    const editor = db as PlatformD1
    await updateCloudAlbum(editor, 1, 1, {
      revision: 1,
      title: 'Renamed',
      slug: 'travel-2026',
      description: 'Changed',
      password: 'protected-password',
    })
    for (const path of ['1', 'ni-hao-world']) {
      const resolved = await resolveCloudAlbumPath(db, 1, path)
      assert.equal(resolved?.albumId, 1)
      assert.equal(resolved?.slug, 'travel-2026')
      assert.equal(resolved?.isCanonical, false)
    }
    assert.equal(
      (await resolveCloudAlbumPath(db, 1, 'travel-2026'))?.isCanonical,
      true,
    )
    const access = await db
      .prepare(
        'SELECT * FROM platform_album_access WHERE site_id=1 AND album_id=1',
      )
      .first()
    await assert.rejects(
      updateCloudAlbum(editor, 1, 1, {
        revision: 1,
        title: 'Stale',
        slug: 'lost-update',
        password: null,
      }),
      { statusCode: 409 },
    )
    assert.equal(await resolveCloudAlbumPath(db, 1, 'lost-update'), null)
    assert.deepEqual(
      await db
        .prepare(
          'SELECT * FROM platform_album_access WHERE site_id=1 AND album_id=1',
        )
        .first(),
      access,
    )
    await assert.rejects(
      updateCloudAlbum(editor, 1, 2, {
        revision: 1,
        title: 'Corrupted',
        slug: 'ni-hao-world',
        password: 'should-not-save',
      }),
      { statusCode: 409 },
    )
    assert.equal(
      (
        await db
          .prepare("SELECT title FROM cloud_albums WHERE site_id=1 AND id='2'")
          .first()
      ).title,
      'Beta',
    )
    assert.equal(
      await db
        .prepare(
          'SELECT 1 FROM platform_album_access WHERE site_id=1 AND album_id=2',
        )
        .first(),
      null,
    )
    const concurrent = await Promise.all([
      createCloudAlbumWithSlug(db, 1, '4', 'Same title'),
      createCloudAlbumWithSlug(db, 1, '5', 'Same title'),
    ])
    assert.equal(new Set(concurrent).size, 2)
    const race = await Promise.allSettled(
      [4, 5].map((id) =>
        updateCloudAlbum(editor, 1, id, {
          revision: 1,
          title: 'Race',
          slug: 'shared-target',
        }),
      ),
    )
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(race.filter((r) => r.status === 'rejected').length, 1)
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) n FROM cloud_album_slugs WHERE site_id=1 AND album_id IN ('4','5') AND is_current=1",
          )
          .first()
      ).n,
      2,
    )
    await db.batch([
      db.prepare(
        'DELETE FROM platform_album_access WHERE site_id=1 AND album_id=1',
      ),
      db.prepare(
        "UPDATE cloud_album_slugs SET album_id=NULL,is_current=0 WHERE site_id=1 AND album_id='1'",
      ),
      db.prepare("DELETE FROM cloud_albums WHERE site_id=1 AND id='1'"),
    ])
    assert.equal(await resolveCloudAlbumPath(db, 1, 'ni-hao-world'), null)
    assert.equal(await resolveCloudAlbumPath(db, 1, 'travel-2026'), null)
    assert.equal(
      (await resolveCloudAlbumPath(db, 2, 'ni-hao-world'))?.albumId,
      1,
    )
    await assert.rejects(
      createCloudAlbumWithSlug(db, 1, '10', 'Reclaim', { slug: 'travel-2026' }),
      { statusCode: 409 },
    )
    assert.equal(
      await db
        .prepare("SELECT 1 FROM cloud_albums WHERE site_id=1 AND id='10'")
        .first(),
      null,
      'failed claim rolls back the new album as well',
    )
    assert.equal(
      await createCloudAlbumWithSlug(db, 1, '10', '你好 World'),
      'ni-hao-world-1',
    )
    for (const slug of ['123', 'Bad Slug', '../bad', 'a'.repeat(81)])
      await assert.rejects(
        createCloudAlbumWithSlug(db, 1, '99', 'Invalid', { slug }),
        { statusCode: 400 },
      )
    for (const path of [
      'bad--slug',
      '0',
      '../bad',
      '999999999999999999999',
      'a'.repeat(81),
    ])
      assert.equal(await resolveCloudAlbumPath(db, 1, path), null)
  } finally {
    await mf.dispose()
  }
})
