import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { readSiteBody } from '../apps/shared/platform/json.ts'
import { createRequire } from 'node:module'
import { readFile, readdir } from 'node:fs/promises'
import { splitSqlQuery } from './helpers/sql.ts'
import {
  processorCipher,
  type ProcessorConfiguration,
  processorKeyHash,
  DEFAULT_PROCESSOR_LIMITS,
  parseProcessorLimits,
  parseProcessorGeocoding,
  DEFAULT_PROCESSOR_GEOCODING,
} from '../packages/contracts/src/processor.ts'
import {
  authenticateProcessor,
  processorEnvelope,
} from '../packages/platform/src/processors.ts'
import { createCloudMediaRepository } from '../packages/database/src/cloud-media.ts'
import { createCloudExecutionRepository } from '../packages/database/src/cloud-execution.ts'
import { queuePhotoProcessing } from '../apps/cloud/server/utils/cloud-photo-processing.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')

test('node configuration is authenticated, key-separated and bound to node, revision and expiry', async () => {
  const key = 'x'.repeat(48),
    other = 'y'.repeat(48),
    context = 'node-a:1:12345',
    cipher = await processorCipher(key)
  const value = await cipher.seal({ token: 'private-token' }, context)
  assert(!value.includes('private-token'))
  assert.deepEqual(await cipher.open(value, context), {
    token: 'private-token',
  })
  await assert.rejects(cipher.open(value, 'node-b:1:12345'))
  await assert.rejects(cipher.open(value, 'node-a:2:12345'))
  await assert.rejects((await processorCipher(other)).open(value, context))
  await assert.rejects(cipher.open(value + 'extra', context))
  assert.throws(() =>
    parseProcessorLimits({
      ...DEFAULT_PROCESSOR_LIMITS,
      maxFileBytes: Infinity,
    }),
  )
  assert.throws(() =>
    parseProcessorGeocoding({
      ...DEFAULT_PROCESSOR_GEOCODING,
      provider: 'mapbox',
    }),
  )
})

test('registered node auth revokes old keys; full schema preserves assets and fences maintenance publication', async () => {
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
        "INSERT INTO platform_users(id,email,created_at) VALUES(1,'test@example.com',1)",
      )
      .run()
    await db
      .prepare("INSERT INTO platform_workspaces(id,name) VALUES(1,'One')")
      .run()
    await db
      .prepare(
        "INSERT INTO platform_sites(id,workspace_id,name) VALUES(1,1,'One'),(2,1,'Two')",
      )
      .run()
    const id = crypto.randomUUID(),
      key = 'pn_' + id + '.' + 'a'.repeat(43),
      next = 'pn_' + id + '.' + 'b'.repeat(43)
    await db
      .prepare(
        'INSERT INTO platform_processor_nodes(id,name,secret_hash,limits_json,created_at) VALUES(?,?,?,?,?)',
      )
      .bind(
        id,
        'A',
        await processorKeyHash(key),
        JSON.stringify(DEFAULT_PROCESSOR_LIMITS),
        1,
      )
      .run()
    const node = await authenticateProcessor(db, key)
    assert(node)
    assert.equal(
      await authenticateProcessor(db, 'old-global-shared-secret'),
      null,
    )
    const source = (
      await readFile(
        'apps/cloud/server/api/internal/worker/[action].post.ts',
        'utf8',
      )
    ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
    const deps = {
      authenticateProcessor,
      processorEnvelope,
      parseProcessorLimits,
      createCloudExecutionRepository,
      definePlatformHandler: (f: any) => f,
      useRuntimeConfig: () => ({
        platform: {
          storageSecret: 's'.repeat(32),
          portalOrigin: 'https://app.example',
          s3EndpointHosts: '',
        },
      }),
      platformPortalOrigin: () => {},
      platformDatabase: () => db,
      getHeader: (e: any, name: string) =>
        name === 'content-type'
          ? 'application/json'
          : name === 'authorization'
            ? 'Bearer ' + e.key
            : undefined,
      getRouterParam: (e: any) => e.action,
      getRequestWebStream: (e: any) =>
        new Response(JSON.stringify(e.body ?? {})).body,
      readSiteBody,
      createError: (v: any) => Object.assign(new Error(v.statusMessage), v),
    }
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const api = new Function(
      'exports',
      ...Object.keys(deps),
      code + ';return exports.default',
    )({}, ...Object.values(deps))
    await assert.rejects(
      api({ action: 'register', key: 'legacy-shared-key' }),
      { statusCode: 401 },
    )
    const registered = await api({
      action: 'register',
      key,
      body: {
        nonce: crypto.randomUUID(),
        version: 'test-build',
        instanceId: 'instance-a',
        hostname: 'host',
        metrics: { rss: 12345, load1: 0.1 },
      },
    })
    assert.equal(registered.nodeId, id)
    const statusRow = await db
      .prepare(
        'SELECT version,last_seen_at,metrics_json FROM platform_processor_nodes WHERE id=?',
      )
      .bind(id)
      .first()
    assert.equal(statusRow.version, 'test-build')
    assert(statusRow.last_seen_at > 0)
    assert.equal(JSON.parse(statusRow.metrics_json).rss, 12345)
    assert(!JSON.stringify(registered).includes('token'))
    const firstSlot = await api({
      action: 'geocoding-slot',
      key,
      body: { provider: 'nominatim' },
    })
    const nextSlot = await api({
      action: 'geocoding-slot',
      key,
      body: { provider: 'nominatim' },
    })
    assert.equal(firstSlot.delayMs, 0)
    assert(nextSlot.delayMs > 500)
    await assert.rejects(
      api({
        action: 'heartbeat',
        key,
        body: { lease: { siteId: 1, id: 'foreign', workerId: 'another-node' } },
      }),
      { statusCode: 403 },
    )
    const config = await processorEnvelope(
      db,
      's'.repeat(32),
      key,
      node,
      100,
      crypto.randomUUID(),
    )
    const decoded = await (
      await processorCipher(key)
    ).open<ProcessorConfiguration>(
      config.envelope,
      `${id}:${config.revision}:${config.issuedAt}:${config.expiresAt}:${config.nonce}`,
    )
    assert.equal(decoded.limits.maxPixels, DEFAULT_PROCESSOR_LIMITS.maxPixels)
    await db
      .prepare('UPDATE platform_processor_nodes SET secret_hash=? WHERE id=?')
      .bind(await processorKeyHash(next), id)
      .run()
    assert.equal(await authenticateProcessor(db, key), null)
    assert(await authenticateProcessor(db, next))
    await db
      .prepare('UPDATE platform_processor_nodes SET enabled=0 WHERE id=?')
      .bind(id)
      .run()
    assert.equal(await authenticateProcessor(db, next), null)
    const queue = createCloudExecutionRepository(db, { id: 1 }),
      media = createCloudMediaRepository(db, { id: 1 })
    await media.reserveUpload({
      id: 'photo',
      ownerId: 1,
      photoId: 'photo',
      sourceVersion: 'v1',
      connectionId: 's3',
      objectKey: 'original.jpg',
      providerUploadId: null,
      expectedBytes: 10,
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
    const lease = await queue.claim(id, 'attempt', 10, 1000)
    assert(lease)
    const firstResult = {
      width: 10,
      height: 10,
      metadata: {
        latitude: 31,
        longitude: 121,
        geocoding: {
          version: 1,
          provider: 'mapbox',
          language: 'en',
          components: {},
        },
      },
      assets: [
        {
          role: 'thumbnail' as const,
          objectKey: `chronoframe/1/derived/photo/v1/1/attempt/thumbnail.webp`,
          bytes: 5,
          contentType: 'image/webp',
        },
      ],
    }
    assert(await queue.complete(lease, firstResult, 20))
    const originalRevision = (
      await db
        .prepare("SELECT revision FROM cloud_photos WHERE id='photo'")
        .first()
    ).revision
    await queuePhotoProcessing(db, 1, 'photo', 'geocoding', originalRevision)
    await assert.rejects(
      queuePhotoProcessing(db, 1, 'photo', 'reindex', originalRevision + 1),
    )
    const maintenance = await queue.claim(id, 'maintenance', Date.now(), 120000)
    assert(maintenance)
    // Editing after queueing must invalidate the result without losing the previous publication.
    await db
      .prepare(
        "UPDATE cloud_photos SET revision=revision+1,title='Edited' WHERE id='photo'",
      )
      .run()
    const guarded = createCloudExecutionRepository(
      db,
      { id: 1 },
      DEFAULT_PROCESSOR_LIMITS,
      originalRevision + 1,
    )
    assert.equal(
      await guarded.complete(
        maintenance,
        {
          ...firstResult,
          assets: [
            {
              ...firstResult.assets[0],
              objectKey: `chronoframe/1/derived/photo/v1/${maintenance.pipelineVersion}/maintenance/thumbnail.webp`,
            },
          ],
        },
        Date.now(),
      ),
      false,
    )
    assert.equal(
      (
        await db
          .prepare("SELECT title FROM cloud_photos WHERE id='photo'")
          .first()
      ).title,
      'Edited',
    )
    assert.equal(
      (await db.prepare('SELECT COUNT(*) n FROM cloud_media_assets').first()).n,
      1,
    )
    await db
      .prepare('UPDATE platform_processor_nodes SET enabled=1 WHERE id=?')
      .bind(id)
      .run()
    const transferred = await api({
      action: 'fail',
      key: next,
      body: {
        lease: maintenance,
        code: 'node_pixel_limit',
        retryable: true,
        requiredPixels: 200000000,
      },
    })
    assert(transferred.ok)
    const requirements = await db
      .prepare('SELECT required_pixels,attempts FROM cloud_processing_jobs')
      .first()
    assert.equal(requirements.required_pixels, 200000000)
    assert.equal(requirements.attempts, 0)
    assert.equal(
      await createCloudExecutionRepository(
        db,
        { id: 1 },
        DEFAULT_PROCESSOR_LIMITS,
      ).claim('small', 'small-attempt', Date.now() + 4000, 120000),
      null,
    )
    assert(
      await createCloudExecutionRepository(
        db,
        { id: 1 },
        { ...DEFAULT_PROCESSOR_LIMITS, maxPixels: 250000000 },
      ).claim('large', 'large-attempt', Date.now() + 4000, 120000),
    )
  } finally {
    await mf.dispose()
  }
})
