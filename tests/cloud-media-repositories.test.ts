import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  createCloudMediaRepository,
  type MediaDatabase,
  type MediaStatement,
} from '../packages/database/src/cloud-media.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

// Run identical behavioral assertions on synchronous SQLite transactions and
// actual workerd D1 batch transactions, rather than mocking SQL results.
for (const backend of ['SQLite', 'D1'] as const) {
  test(`${backend}: durable media catalog isolates tenants and atomically completes uploads`, async () => {
    const sqlite = backend === 'SQLite' ? new Database(':memory:') : null
    const mf =
      backend === 'D1'
        ? new Miniflare(
            convertV4MiniflareOptions({
              modules: true,
              compatibilityDate: '2026-10-22',
              script: 'export default {fetch(){return new Response("test")}}',
              d1Databases: ['DB'],
            }),
          )
        : null
    try {
      let db: MediaDatabase
      if (sqlite) {
        sqlite.pragma('foreign_keys = ON')
        class Statement implements MediaStatement {
          sql: string
          values: (string | number | null)[] = []
          constructor(sql: string) {
            this.sql = sql
          }
          bind(...values: (string | number | null)[]) {
            this.values = values
            return this
          }
          async all<T>() {
            return {
              results: sqlite!.prepare(this.sql).all(...this.values) as T[],
            }
          }
        }
        db = {
          prepare: (sql) => new Statement(sql),
          async batch(statements) {
            sqlite.transaction(() => {
              for (const statement of statements) {
                const s = statement as Statement
                sqlite.prepare(s.sql).run(...s.values)
              }
            })()
          },
        }
      } else db = await mf!.getD1Database('DB')
      async function run(sql: string) {
        await db.batch([db.prepare(sql)])
      }
      for (const file of [
        '0001_platform.sql',
        '0002_visitor_access.sql',
        '0003_account_security.sql',
        '0004_workspace_sites.sql',
      ]) {
        const sql = await readFile(
          new URL('../packages/platform/migrations/' + file, import.meta.url),
          'utf8',
        )
        for (const part of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
          .map((s) => s.trim())
          .filter(Boolean))
          await run(part)
      }
      await run(
        "INSERT INTO platform_users(id,email,created_at) VALUES(1,'one@example.com',1),(2,'two@example.com',1)",
      )
      await run("INSERT INTO platform_workspaces(id,name) VALUES(1,'Original')")
      await run(
        "INSERT INTO platform_sites(id,workspace_id,name,published) VALUES(1,1,'One',0),(2,1,'Two',0)",
      )
      const migration =
        (await readFile(
          new URL(
            '../packages/platform/migrations/0005_media_catalog.sql',
            import.meta.url,
          ),
          'utf8',
        )) +
        '\n' +
        (await readFile(
          new URL(
            '../packages/platform/migrations/0009_cloud_usage_events.sql',
            import.meta.url,
          ),
          'utf8',
        ))
      for (const part of splitSqlQuery(migration.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (part.startsWith('ALTER TABLE cloud_uploads'))
          await run(
            "INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at) VALUES(1,'pre-upgrade',1,'pre-upgrade','v1','storage-1','originals/pre-upgrade',42,1000)",
          )
        await run(part)
      }
      for (const file of [
        '0008_cloud_albums.sql',
        '0012_cloud_album_slugs.sql',
      ]) {
        const sql = await readFile(
          new URL('../packages/platform/migrations/' + file, import.meta.url),
          'utf8',
        )
        for (const part of splitSqlQuery(sql.replace(/^--.*$/gm, ''))
          .map((s) => s.trim())
          .filter(Boolean))
          await run(part)
      }
      assert.equal(
        (
          await db
            .prepare(
              "SELECT expected_video_bytes FROM cloud_uploads WHERE site_id=1 AND id='pre-upgrade'",
            )
            .all<{ expected_video_bytes: number }>()
        ).results[0]?.expected_video_bytes,
        0,
      )

      assert.equal(
        (
          await db
            .prepare('SELECT name FROM platform_workspaces WHERE id=1')
            .all<{ name: string }>()
        ).results[0]?.name,
        'Original',
      )
      const a = createCloudMediaRepository(db, { id: 1 }),
        b = createCloudMediaRepository(db, { id: 2 })
      assert.throws(() => createCloudMediaRepository(db, { id: 0 }))
      const reserve = (id: string, photoId = id, expiresAt = 1000) => ({
        id,
        ownerId: 1,
        photoId,
        sourceVersion: 'v1',
        connectionId: 'storage-1',
        objectKey: `originals/${id}`,
        providerUploadId: 'multipart-1',
        expectedBytes: 42,
        expiresAt,
      })
      const complete = (id: string, jobId = id) => ({
        id,
        ownerId: 1,
        jobId,
        pipelineVersion: 'p1',
        title: 'Photo',
        now: 10,
      })
      await a.reserveUpload(reserve('same'))
      await a.reserveUpload(reserve('same'))
      await assert.rejects(
        a.reserveUpload({ ...reserve('same'), expectedBytes: 99 }),
        { statusCode: 409 },
      )
      await b.reserveUpload(reserve('same'))
      assert.equal(await a.upload('same', 2), null)
      assert.equal(
        await a.upload('same', 1).then((u) => u?.provider_upload_id),
        'multipart-1',
      )
      const parallel = await Promise.all([
        a.completeUpload(complete('same')),
        a.completeUpload(complete('same')),
      ])
      assert.deepEqual(parallel, ['same', 'same'])
      assert.equal(await a.completeUpload(complete('same')), 'same')
      await assert.rejects(a.completeUpload(complete('same', 'different')), {
        statusCode: 409,
      })
      assert.equal(await b.photo('same'), null)
      assert.equal(await b.job('same'), null)
      await b.completeUpload({ ...complete('same'), title: 'Other tenant' })
      assert.equal((await a.photo('same'))?.title, 'Photo')
      assert.equal((await b.photo('same'))?.title, 'Other tenant')
      for (const id of ['album', '0', '01', '-1', '1.2', '9007199254740992'])
        await assert.rejects(a.createAlbum(id, 'Invalid'), { statusCode: 400 })
      await a.createAlbum('1', 'My album')
      await a.createAlbum('1', 'My album')
      await assert.rejects(a.createAlbum('1', 'Other'), { statusCode: 409 })
      await a.addToAlbum('1', 'same')
      await a.addToAlbum('1', 'same')
      assert.equal((await a.albumPhotos('1')).length, 1)
      assert.equal((await a.albumPhotos('1', 'same')).length, 0)
      assert.equal(await b.album('1'), null)
      await b.createAlbum('2', 'Other')
      await assert.rejects(b.addToAlbum('1', 'same'))
      await assert.rejects(a.addToAlbum('1', 'missing'))
      // Foreign key failure in the second operation must roll back the first.
      await assert.rejects(
        db.batch([
          db.prepare(
            "INSERT INTO cloud_albums VALUES(1,'rolled-back','Rollback')",
          ),
          db.prepare("INSERT INTO cloud_album_photos VALUES(2,'2','missing')"),
        ]),
      )
      assert.equal(await a.album('rolled-back'), null)
      await a.reserveUpload(reserve('collision'))
      await assert.rejects(a.completeUpload(complete('collision', 'same')))
      assert.equal(await a.photo('collision'), null)
      assert.equal((await a.upload('collision', 1))?.state, 'pending')
      await a.reserveUpload(reserve('expired', 'expired', 5))
      await assert.rejects(a.completeUpload(complete('expired')), {
        statusCode: 409,
      })
      await a.reserveUpload(reserve('cancelled'))
      await a.cancelUpload('cancelled', 2)
      assert.equal((await a.upload('cancelled', 1))?.state, 'pending')
      await a.cancelUpload('cancelled', 1)
      await assert.rejects(a.completeUpload(complete('cancelled')), {
        statusCode: 409,
      })
      await a.deletePhoto('same')
      assert.equal(await a.photo('same'), null)
      await assert.rejects(a.addToAlbum('1', 'same'), { statusCode: 404 })
      assert.equal((await a.job('same'))?.state, 'cancelled')
      assert.equal((await a.albumPhotos('1')).length, 0)
      assert.equal((await b.photo('same'))?.title, 'Other tenant')
      assert.equal(await a.completeUpload(complete('same')), 'same')
      assert.equal(await a.photo('same'), null) // retry cannot resurrect a tombstone
      await assert.rejects(
        a.reserveUpload({ ...reserve('bad'), expectedBytes: 0 }),
        { statusCode: 400 },
      )
      await assert.rejects(
        a.reserveUpload({ ...reserve('unknown'), ownerId: 999 }),
      )
      // Serializable session survives new repository instances (no closures in data).
      assert.equal(
        (await createCloudMediaRepository(db, { id: 1 }).upload('collision', 1))
          ?.object_key,
        'originals/collision',
      )
    } finally {
      sqlite?.close()
      await mf?.dispose()
    }
  })
}

test('D1 media sessions and queued jobs survive a workerd restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chronoframe-media-'))
  const options = () => ({
    ...convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-22',
      script: 'export default {fetch(){return new Response("test")}}',
      d1Databases: ['DB'],
    }),
    resourcePersistencePath: directory,
  })
  let mf = new Miniflare(options())
  try {
    let db = await mf.getD1Database('DB')
    for (const sql of [
      'CREATE TABLE platform_sites(id INTEGER PRIMARY KEY)',
      'CREATE TABLE platform_users(id INTEGER PRIMARY KEY)',
      'INSERT INTO platform_sites VALUES(1)',
      'INSERT INTO platform_users VALUES(1)',
    ])
      await db.prepare(sql).run()
    const migration =
      (await readFile(
        new URL(
          '../packages/platform/migrations/0005_media_catalog.sql',
          import.meta.url,
        ),
        'utf8',
      )) +
      '\n' +
      (await readFile(
        new URL(
          '../packages/platform/migrations/0009_cloud_usage_events.sql',
          import.meta.url,
        ),
        'utf8',
      ))
    for (const sql of splitSqlQuery(migration.replace(/^--.*$/gm, ''))
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run()
    let repository = createCloudMediaRepository(db, { id: 1 })
    await repository.reserveUpload({
      id: 'upload',
      ownerId: 1,
      photoId: 'photo',
      sourceVersion: 'v1',
      connectionId: 'storage',
      objectKey: 'originals/photo',
      providerUploadId: 'provider-id',
      expectedBytes: 32,
      expiresAt: 1000,
    })
    await mf.dispose()
    mf = new Miniflare(options())
    db = await mf.getD1Database('DB')
    repository = createCloudMediaRepository(db, { id: 1 })
    assert.equal(
      (await repository.upload('upload', 1))?.provider_upload_id,
      'provider-id',
    )
    await repository.completeUpload({
      id: 'upload',
      ownerId: 1,
      jobId: 'job',
      pipelineVersion: 'p1',
      title: 'Photo',
      now: 2,
    })
    await mf.dispose()
    mf = new Miniflare(options())
    db = await mf.getD1Database('DB')
    repository = createCloudMediaRepository(db, { id: 1 })
    assert.equal((await repository.upload('upload', 1))?.state, 'completed')
    assert.equal((await repository.job('job'))?.state, 'queued')
    assert.equal((await repository.photo('photo'))?.source_version, 'v1')
  } finally {
    await mf.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
