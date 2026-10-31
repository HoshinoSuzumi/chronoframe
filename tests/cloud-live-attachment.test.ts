import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import ts from 'typescript'
import { splitSqlQuery } from './helpers/sql.ts'
import { workspaceUsageSQL } from '../packages/platform/src/entitlements.ts'
import { createCloudMediaRepository } from '../packages/database/src/cloud-media.ts'
import { createCloudExecutionRepository } from '../packages/database/src/cloud-execution.ts'
const require = createRequire(import.meta.url),
  { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve('wrangler/package.json'),
  )('miniflare')
test('post-upload MOV pairing verifies ownership, object metadata, quota and revisions before queueing once', async () => {
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
      for (const sql of splitSqlQuery(
        (
          await readFile('packages/platform/migrations/' + file, 'utf8')
        ).replace(/^--.*$/gm, ''),
      ))
        if (sql.trim()) await db.prepare(sql).run()
    await db
      .prepare(
        "INSERT INTO platform_users(id,email,created_at) VALUES(1,'one@example.com',1)",
      )
      .run()
    await db
      .prepare("INSERT INTO platform_workspaces(id,name) VALUES(1,'One')")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name) VALUES(1,1,'One')",
      )
      .run()
    const media = createCloudMediaRepository(db, { id: 1 }),
      queue = createCloudExecutionRepository(db, { id: 1 })
    await media.reserveUpload({
      id: 'photo',
      ownerId: 1,
      photoId: 'photo',
      sourceVersion: '1',
      connectionId: 's3',
      objectKey: 'source.jpg',
      providerUploadId: null,
      expectedBytes: 20,
      expiresAt: 100000,
    })
    await media.completeUpload({
      id: 'photo',
      ownerId: 1,
      jobId: 'photo',
      pipelineVersion: '1',
      title: 'Photo',
      now: 1,
    })
    const lease = await queue.claim('node', 'attempt', 10, 1000)
    assert(lease)
    await queue.complete(
      lease,
      {
        width: 16,
        height: 12,
        metadata: {},
        assets: [
          {
            role: 'thumbnail',
            objectKey: 'chronoframe/1/derived/photo/1/1/attempt/thumbnail.webp',
            bytes: 5,
            contentType: 'image/webp',
          },
        ],
      },
      20,
    )
    const revision = (
      await db
        .prepare("SELECT revision FROM cloud_photos WHERE id='photo'")
        .first()
    ).revision
    const source = (
      await readFile('apps/cloud/server/utils/cloud-live-attachment.ts', 'utf8')
    ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
    const deps = {
      workspaceUsageSQL,
      workspaceEntitlements: async () => ({
        limits: {
          fileBytes: 1000,
          monthlyBytes: 10000,
          storageBytes: 10000,
          byos: true,
        },
        quotaPeriod: { start: 0 },
      }),
      crypto,
      createError: (v: any) => Object.assign(new Error(v.statusMessage), v),
    }
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const attach = new Function(
      'exports',
      ...Object.keys(deps),
      code + ';return exports.cloudLiveAttachment',
    )({}, ...Object.values(deps))
    let bytes = 99
    const signed: string[] = []
    const ctx = {
      raw: db,
      siteId: 1,
      userId: 1,
      site: { workspaceId: 1 },
      vault: { resolve: async () => ({ poolId: 'pool' }) },
      storage: async () => ({
        s3: {
          signPut: async (key: string) => {
            signed.push(key)
            return 'https://storage.example/' + key
          },
          head: async () => ({
            bytes,
            contentType: 'video/quicktime',
            etag: '"verified"',
          }),
        },
      }),
    }
    await assert.rejects(
      attach(
        ctx,
        'photo',
        { phase: 'prepare', revision, fileName: 'bad.mp4', bytes: 100 },
        30,
      ),
      { statusCode: 400 },
    )
    await assert.rejects(
      attach(
        ctx,
        'foreign',
        { phase: 'prepare', revision, fileName: 'live.mov', bytes: 100 },
        30,
      ),
      { statusCode: 409 },
    )
    const prepared = await attach(
      ctx,
      'photo',
      { phase: 'prepare', revision, fileName: 'live.mov', bytes: 100 },
      30,
    )
    assert(signed[0].startsWith('chronoframe/1/live-attachments/'))
    const complete = { phase: 'complete', revision, uploadId: prepared.id }
    await assert.rejects(attach(ctx, 'photo', complete, 40), {
      statusCode: 400,
    })
    assert.equal(
      (await db.prepare('SELECT state FROM cloud_processing_jobs').first())
        .state,
      'succeeded',
    )
    bytes = 100
    assert((await attach(ctx, 'photo', complete, 50)).ok)
    assert.equal(
      (
        await db
          .prepare('SELECT state,operation FROM cloud_processing_jobs')
          .first()
      ).operation,
      'live-photo',
    )
    assert.equal(
      (await db.prepare('SELECT COUNT(*) n FROM cloud_media_assets').first()).n,
      1,
    )
    assert.equal(
      (await db.prepare('SELECT upload_id FROM cloud_photo_companions').first())
        .upload_id,
      prepared.id,
    )
    assert((await attach(ctx, 'photo', complete, 60)).ok)
    assert.equal(
      (await db.prepare('SELECT COUNT(*) n FROM cloud_usage_events').first()).n,
      2,
    )
  } finally {
    await mf.dispose()
  }
})
