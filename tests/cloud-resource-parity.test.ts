import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createResourceReader } from '@chronoframe/core'
import * as schema from '../packages/database/src/schema.ts'
import { createSqliteResourceRepository } from '../packages/database/src/sqlite-resources.ts'
import { backfillAlbumSlugs } from '../packages/database/src/album-slugs.ts'
import { createCloudResourceRepository } from '../packages/database/src/cloud-resources.ts'
import { createCloudMediaRepository } from '../packages/database/src/cloud-media.ts'
import { createCloudExecutionRepository } from '../packages/database/src/cloud-execution.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
test('Cloud D1 and Self-hosted SQLite share ordering, visibility and protected-album behavior', async () => {
  const sqlite = new Database(':memory:'),
    legacy = drizzle(sqlite, { schema })
  migrate(legacy, { migrationsFolder: './packages/database/migrations' })
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
    for (const name of (await readdir('packages/platform/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = await readFile('packages/platform/migrations/' + name, 'utf8')
      for (const statement of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(statement).run()
    }
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at) VALUES(1,'test@example.com',1)",
      )
      .run()
    await db
      .prepare("INSERT INTO platform_workspaces(id,name) VALUES(1,'Test')")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'One',0),(2,1,'Two',0)",
      )
      .run()
    const media = createCloudMediaRepository(db, { id: 1 }),
      queue = createCloudExecutionRepository(db, { id: 1 })
    const fixtures = [
      { id: 'old', dateTaken: '2020-01-01', title: 'Old' },
      { id: 'new', dateTaken: '2026-01-01', title: 'New' },
      { id: 'hidden', dateTaken: null, title: 'Hidden photo' },
      { id: 'locked', dateTaken: null, title: 'Locked photo' },
    ]
    legacy.insert(schema.photos).values(fixtures).run()
    for (const p of fixtures) {
      await media.reserveUpload({
        id: p.id,
        ownerId: 1,
        photoId: p.id,
        sourceVersion: '1',
        connectionId: 'storage',
        objectKey: 'source/' + p.id,
        providerUploadId: null,
        expectedBytes: 32,
        expiresAt: 10000,
      })
      await media.completeUpload({
        id: p.id,
        ownerId: 1,
        jobId: p.id,
        pipelineVersion: '1',
        title: p.title,
        now: 1,
      })
      const lease = (await queue.claim('worker', 'attempt-' + p.id, 2, 1000))!
      await queue.complete(
        lease,
        {
          width: 32,
          height: 16,
          metadata: { dateTaken: p.dateTaken },
          assets: [
            {
              role: 'thumbnail',
              objectKey: `chronoframe/1/derived/${p.id}/1/1/${lease.attemptId}/thumbnail.webp`,
              bytes: 32,
              contentType: 'image/webp',
            },
          ],
        },
        3,
      )
    }
    legacy
      .insert(schema.albums)
      .values([
        { id: 1, title: 'Public', position: 2 },
        { id: 2, title: 'Hidden', isHidden: true, position: 1 },
        { id: 3, title: 'Locked', passwordHash: 'password', position: 0 },
      ])
      .run()
    backfillAlbumSlugs(legacy)
    for (const a of [
      { id: '1', title: 'Public', position: 2, hidden: 0 },
      { id: '2', title: 'Hidden', position: 1, hidden: 1 },
      { id: '3', title: 'Locked', position: 0, hidden: 0 },
    ]) {
      await media.createAlbum(a.id, a.title)
      await db
        .prepare(
          'UPDATE cloud_albums SET position=?,hidden=? WHERE site_id=1 AND id=?',
        )
        .bind(a.position, a.hidden, a.id)
        .run()
    }
    await db
      .prepare('INSERT INTO platform_album_access VALUES(1,3,?,?,?)')
      .bind('revision', 'salt', 'a'.repeat(64))
      .run()
    for (const m of [
      { albumId: 1, photoId: 'old', position: 30 },
      { albumId: 1, photoId: 'new', position: 10 },
      { albumId: 1, photoId: 'hidden', position: 5 },
      { albumId: 1, photoId: 'locked', position: 20 },
      { albumId: 2, photoId: 'hidden', position: 0 },
      { albumId: 3, photoId: 'locked', position: 0 },
    ]) {
      legacy.insert(schema.albumPhotos).values(m).run()
      await media.addToAlbum(String(m.albumId), m.photoId)
      await db
        .prepare(
          'UPDATE cloud_album_photos SET position=? WHERE site_id=1 AND album_id=? AND photo_id=?',
        )
        .bind(m.position, String(m.albumId), m.photoId)
        .run()
    }
    const readers = [
      createResourceReader(createSqliteResourceRepository(legacy, { id: 1 })),
      createResourceReader(
        createCloudResourceRepository(db, { id: 1 }, '/api/public/media'),
      ),
    ]
    for (const reader of readers) {
      assert.deepEqual(
        (await reader.listPhotos({ admin: true })).slice(0, 2).map((p) => p.id),
        ['new', 'old'],
      )
      assert.deepEqual(
        (await reader.listVisiblePhotos()).map((p) => p.id),
        ['new', 'old'],
      )
      const albums = await reader.listAlbums({ admin: false })
      assert.deepEqual(
        albums.map((a) => a.id),
        [3, 1],
      )
      assert.deepEqual(albums[0]?.photoIds, [])
      assert.deepEqual(albums[1]?.photoIds, ['new', 'old'])
      await assert.rejects(
        reader.getAlbum(2, { admin: false, canAccess: () => false }),
        { statusCode: 404 },
      )
      await assert.rejects(
        reader.getAlbum(3, { admin: false, canAccess: () => false }),
        { statusCode: 403 },
      )
      assert.deepEqual(
        (
          await reader.getAlbum(3, { admin: false, canAccess: () => true })
        ).photos.map((p) => p.id),
        ['locked'],
      )
    }
    assert.deepEqual(
      await createCloudResourceRepository(
        db,
        { id: 2 },
        '/api/public/media',
      ).listPhotos(),
      [],
    )
    const unlocked = await readers[1]!.getAlbum(3, {
      admin: false,
      canAccess: () => true,
    })
    assert.equal(
      unlocked.photos[0]?.originalUrl,
      '/api/public/media/locked/display',
    )
    assert(!JSON.stringify(unlocked).includes('source/locked'))
    await db
      .prepare(
        "UPDATE cloud_albums SET cover_photo_id='old' WHERE site_id=1 AND id='1'",
      )
      .run()
    await media.deletePhoto('old')
    await db
      .prepare(
        "UPDATE cloud_photos SET metadata_json=NULL WHERE site_id=1 AND id='new'",
      )
      .run()
    const current = createCloudResourceRepository(
      db,
      { id: 1 },
      '/api/public/media',
    )
    assert.deepEqual(await current.listAlbumPhotoIds(1), ['hidden', 'locked'])
    assert.equal((await current.getAlbum(1))?.resource.coverPhotoId, null)
    assert.deepEqual(
      (await createResourceReader(current).listAlbums({ admin: false })).find(
        (a) => a.id === 1,
      )?.photoIds,
      [],
    )
  } finally {
    sqlite.close()
    await mf.dispose()
  }
})
