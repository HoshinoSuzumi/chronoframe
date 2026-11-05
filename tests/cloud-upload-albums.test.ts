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
import { photoTitleFromFileName } from '../packages/contracts/src/photo.ts'
import { createCloudResourceRepository } from '../packages/database/src/cloud-resources.ts'
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
      async run() {
        return {
          meta: {
            changes: sqlite.prepare(this.sql).run(...this.values).changes,
          },
        }
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
        storage: async () => ({
          s3: {
            head: async () => ({
              bytes: 10,
              contentType: 'image/jpeg',
              etag: 'verified',
            }),
          },
        }),
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
      photoTitleFromFileName,
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
    )({}, ...Object.values(deps)) as (event: RequestEvent) => Promise<{
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
    operation = 'uploads/upload/complete'
    await api({ method: 'POST', body: {} })
    assert.equal((await repository.photo('upload'))?.title, 'one')
    assert.equal((await repository.upload('upload', 1))?.state, 'completed')
    assert.equal(
      sqlite
        .prepare<[], { file_name: string }>(
          "SELECT file_name FROM cloud_uploads WHERE site_id=1 AND id='upload'",
        )
        .get()?.file_name,
      'one.jpg',
    )

    // Explicitly choosing the original filename is still a custom title.
    sqlite
      .prepare(
        "UPDATE cloud_photos SET metadata_json='{}' WHERE site_id=1 AND id='upload'",
      )
      .run()
    operation = 'photos/upload'
    await api({ method: 'PATCH', body: { title: 'one.jpg', revision: 1 } })
    const edited = sqlite
      .prepare(
        "SELECT title,title_is_custom FROM cloud_photos WHERE site_id=1 AND id='upload'",
      )
      .get() as { title: string; title_is_custom: number }
    assert.equal(edited.title, 'one.jpg')
    assert.equal(edited.title_is_custom, 1)
    sqlite
      .prepare(
        "INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,object_key,bytes,content_type) VALUES(1,'upload',(SELECT source_version FROM cloud_photos WHERE site_id=1 AND id='upload'),'1','thumbnail','storage','thumb',10,'image/webp')",
      )
      .run()
    for (const prefix of ['/api/public/media', '/api/sites/1/media']) {
      const resources = createCloudResourceRepository(db, { id: 1 }, prefix)
      assert.equal((await resources.listPhotos())[0]?.title, 'one.jpg')
      assert.equal((await resources.listAlbumPhotos(1))[0]?.title, 'one.jpg')
    }
    assert.deepEqual(
      sqlite
        .prepare<[], { album_id: string }>(
          'SELECT album_id FROM cloud_album_photos WHERE site_id=1 ORDER BY album_id',
        )
        .all()
        .map((r) => r.album_id),
      ['1'],
    )
    sqlite
      .prepare(
        "UPDATE cloud_photos SET metadata_json=NULL WHERE site_id=1 AND id='upload'",
      )
      .run()
    operation = 'photos'
    sqlite
      .prepare(
        "UPDATE cloud_processing_jobs SET state='failed' WHERE site_id=1 AND id='upload'",
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
            "SELECT COUNT(*) AS total FROM cloud_processing_jobs WHERE site_id=1 AND id='upload'",
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
        "UPDATE cloud_processing_jobs SET state='running',created_at=1 WHERE site_id=1 AND id='upload'",
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
    for (const id of ['upload', 'more-0', 'more-1'])
      assert(jobs.some((job) => job.id === id))
    assert.equal(jobs.filter((job) => job.state === 'succeeded').length, 100)
    sqlite
      .prepare(
        "UPDATE cloud_photos SET deleted=1 WHERE site_id=1 AND id='upload'",
      )
      .run()
    const afterDelete = (await api({ method: 'GET', body: {} })).jobs!
    assert.equal(afterDelete.length, 102)
    assert(!afterDelete.some((job) => job.id === 'upload'))
  } finally {
    sqlite.close()
  }
})
