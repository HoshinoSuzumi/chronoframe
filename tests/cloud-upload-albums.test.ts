import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import Database from 'better-sqlite3'
import ts from 'typescript'
import {
  createCloudMediaRepository,
  type MediaDatabase,
  type MediaStatement,
} from '../packages/database/src/cloud-media.ts'
import { workspaceUsageSQL } from '../packages/platform/src/entitlements.ts'
import {
  uploadAlbumIds,
  validateUploadAlbums,
} from '../apps/cloud/server/utils/cloud-upload-albums.ts'

test('upload reservation persists canonical site-owned albums and refuses changing choices on resume', async () => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  try {
    for (const name of (await readdir('packages/platform/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      sqlite.exec(
        await readFile('packages/platform/migrations/' + name, 'utf8'),
      )
    sqlite.exec(
      "INSERT INTO platform_users(id,email,created_at) VALUES(1,'one@example.com',1); INSERT INTO platform_workspaces(id,name) VALUES(1,'Workspace'); INSERT INTO platform_sites(id,workspace_id,name) VALUES(1,1,'One'),(2,1,'Two'); INSERT INTO cloud_albums(site_id,id,title) VALUES(1,'1','First'),(1,'2','Second'),(2,'3','Foreign')",
    )
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
        return { results: sqlite.prepare(this.sql).all(...this.values) as T[] }
      }
      async first() {
        return sqlite.prepare(this.sql).get(...this.values) ?? null
      }
    }
    const db = {
      prepare: (sql: string) => new Statement(sql),
      async batch(statements: MediaStatement[]) {
        sqlite.transaction(() => {
          for (const s of statements) {
            assert(s instanceof Statement)
            sqlite.prepare(s.sql).run(...s.values)
          }
        })()
      },
    }
    db satisfies MediaDatabase
    type RequestEvent = { method: string; body: Record<string, unknown> }
    const repository = createCloudMediaRepository(db, { id: 1 })
    const source = (
      await readFile(
        'apps/cloud/server/api/sites/[siteId]/media/[...operation].ts',
        'utf8',
      )
    ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    let operation = 'uploads'
    const deps = {
      definePlatformHandler: <T>(f: T) => f,
      cloudMedia: async () => ({
        siteId: 1,
        userId: 1,
        site: { workspaceId: 1 },
        db,
        raw: db,
        repository,
        resources: { listPhotos: async () => [] },
        sql: async (query: string, ...values: (string | number | null)[]) =>
          (
            await db
              .prepare(query)
              .bind(...values)
              .all()
          ).results,
        vault: {
          list: async () => [{ id: 'storage', uploads_enabled: 1 }],
          get: async () => ({ poolId: 'pool', enabled: true, revision: 1 }),
        },
      }),
      getRouterParam: () => operation,
      siteManagementBody: async (event: RequestEvent) => event.body,
      uploadAlbumIds,
      validateUploadAlbums,
      workspaceUsageSQL,
      workspaceEntitlements: async () => ({
        limits: {
          fileBytes: 1000,
          photos: 100,
          monthlyBytes: 100000,
          storageBytes: 100000,
        },
        quotaPeriod: { start: 1 },
      }),
      createError: (value: {
        statusCode: number
        statusMessage?: string
        data?: Record<string, unknown>
      }) => Object.assign(new Error(value.statusMessage), value),
    }
    const api = new Function(
      'exports',
      ...Object.keys(deps),
      code + '; return exports.default',
    )({}, ...Object.values(deps)) as (
      event: RequestEvent,
    ) => Promise<{
      id?: string
      jobs?: { id: string; photo_id: string; state: string }[]
    }>
    const body = {
      requestId: 'upload',
      connectionId: 'storage',
      fileName: 'one.jpg',
      bytes: 10,
      albumIds: [2, 1],
    }
    const post = (override = {}) =>
      api({ method: 'POST', body: { ...body, ...override } })
    await post()
    assert.equal(
      (await repository.upload('upload', 1))?.album_ids_json,
      '[1,2]',
    )
    await post({ albumIds: [1, 2] })
    await assert.rejects(post({ albumIds: [1] }), { statusCode: 409 })
    await assert.rejects(post({ requestId: 'foreign', albumIds: [3] }), {
      statusCode: 400,
    })
    assert.equal(await repository.upload('foreign', 1), null)
    sqlite.prepare("DELETE FROM cloud_albums WHERE site_id=1 AND id='2'").run()
    await post({ albumIds: [1, 2] })
    await assert.rejects(post({ requestId: 'new-after-deletion' }), {
      statusCode: 400,
      data: { code: 'upload_albums_unavailable' },
    })
    await repository.completeUpload({
      id: 'upload',
      ownerId: 1,
      jobId: 'job',
      pipelineVersion: '1',
      title: 'Photo',
      now: Date.now(),
    })
    assert.deepEqual(
      sqlite
        .prepare<[], { album_id: string }>(
          'SELECT album_id FROM cloud_album_photos WHERE site_id=1 ORDER BY album_id',
        )
        .all()
        .map((r) => r.album_id),
      ['1'],
    )
    operation = 'photos'
    sqlite
      .prepare(
        "UPDATE cloud_processing_jobs SET state='failed' WHERE site_id=1 AND id='job'",
      )
      .run()
    const beforeDelete = await api({ method: 'GET', body: {} })
    assert.equal(beforeDelete.jobs?.length, 1) // Not-ready failures remain actionable.
    sqlite
      .prepare(
        "INSERT INTO cloud_photos(site_id,id,source_version,title) VALUES(2,'upload','1','Other site')",
      )
      .run()
    sqlite
      .prepare(
        "UPDATE cloud_photos SET deleted=1 WHERE site_id=1 AND id='upload'",
      )
      .run()
    for (let visit = 0; visit < 2; visit++)
      assert.deepEqual((await api({ method: 'GET', body: {} })).jobs, [])
    assert.equal(
      (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS total FROM cloud_processing_jobs WHERE site_id=1 AND id='job'",
          )
          .get() as { total: number }
      ).total,
      1,
    )
    sqlite
      .prepare(
        "UPDATE cloud_photos SET deleted=0 WHERE site_id=1 AND id='upload'",
      )
      .run()
    sqlite
      .prepare(
        "UPDATE cloud_processing_jobs SET state='running',created_at=1 WHERE site_id=1 AND id='job'",
      )
      .run()
    sqlite.transaction(() => {
      for (let index = 0; index < 125; index++) {
        const id = 'more-' + index
        sqlite
          .prepare(
            "INSERT INTO cloud_photos(site_id,id,source_version,title) VALUES(1,?,'1','Photo')",
          )
          .run(id)
        sqlite
          .prepare(
            "INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,object_key,expected_bytes,expires_at) VALUES(1,?,1,?,'1','storage',?,10,9999999999999)",
          )
          .run(id, id, id)
        sqlite
          .prepare(
            "INSERT INTO cloud_processing_jobs(site_id,id,upload_id,photo_id,source_version,pipeline_version,state,created_at) VALUES(1,?,?,?,'1','1',?,?)",
          )
          .run(
            id,
            id,
            id,
            index === 0 ? 'queued' : index === 1 ? 'retry_wait' : 'succeeded',
            index < 2 ? index + 2 : 10000 + index,
          )
      }
    })()
    const jobs = (await api({ method: 'GET', body: {} })).jobs!
    assert.equal(jobs.length, 103) // All three older active jobs plus 100 history rows.
    for (const id of ['job', 'more-0', 'more-1'])
      assert(jobs.some((job) => job.id === id))
    assert.equal(jobs.filter((job) => job.state === 'succeeded').length, 100)
    sqlite
      .prepare(
        "UPDATE cloud_photos SET deleted=1 WHERE site_id=1 AND id='upload'",
      )
      .run()
    const afterDelete = (await api({ method: 'GET', body: {} })).jobs!
    assert.equal(afterDelete.length, 102)
    assert(!afterDelete.some((job) => job.id === 'job'))
  } finally {
    sqlite.close()
  }
})
