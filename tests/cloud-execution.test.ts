import { splitSqlQuery } from './helpers/sql.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { createCloudMediaRepository } from '../packages/database/src/cloud-media.ts'
import { createCloudExecutionRepository } from '../packages/database/src/cloud-execution.ts'
import type {
  CloudLease,
  CloudMediaResult,
} from '../packages/core/src/cloud-execution.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
test('D1 queue serializes claims, fences expired attempts, retries and refuses deleted/foreign source results', async () => {
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
    for (const sql of [
      'CREATE TABLE platform_sites(id INTEGER PRIMARY KEY,suspended INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE platform_users(id INTEGER PRIMARY KEY)',
      'INSERT INTO platform_sites(id) VALUES(1),(2)',
      'INSERT INTO platform_users VALUES(1)',
    ])
      await db.prepare(sql).run()
    for (const name of [
      '0005_media_catalog.sql',
      '0006_cloud_execution.sql',
      '0007_cloud_storage.sql',
      '0009_cloud_usage_events.sql',
    ]) {
      const migration = await readFile(
        new URL('../packages/platform/migrations/' + name, import.meta.url),
        'utf8',
      )
      for (const sql of splitSqlQuery(migration.replace(/^--.*$/gm, ''))
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(sql).run()
    }
    const media = createCloudMediaRepository(db, { id: 1 }),
      queue = createCloudExecutionRepository(db, { id: 1 })
    async function enqueue(id: string) {
      await media.reserveUpload({
        id,
        ownerId: 1,
        photoId: id,
        sourceVersion: 'v1',
        connectionId: 'storage',
        objectKey: 'originals/' + id,
        providerUploadId: null,
        expectedBytes: 10,
        expiresAt: 100000,
      })
      await media.completeUpload({
        id,
        ownerId: 1,
        jobId: id,
        pipelineVersion: 'p1',
        title: id,
        now: 1,
      })
    }
    const result = (lease: CloudLease): CloudMediaResult => ({
      width: 10,
      height: 20,
      metadata: {},
      assets: [
        {
          role: 'thumbnail',
          objectKey: `chronoframe/1/derived/${lease.photoId}/v1/p1/${lease.attemptId}/thumbnail.webp`,
          bytes: 32,
          contentType: 'image/webp',
        },
      ],
    })
    await enqueue('first')
    const claimed = await Promise.all([
      queue.claim('worker-a', 'attempt-a', 10, 1000),
      queue.claim('worker-b', 'attempt-b', 10, 1000),
    ])
    assert.equal(claimed.filter(Boolean).length, 1)
    const first = claimed.find(Boolean)!
    assert.equal(first.attempts, 1)
    assert.equal(
      await createCloudExecutionRepository(db, { id: 1 }).claim(
        'restart',
        'attempt-restart',
        500,
        1000,
      ),
      null,
    )
    assert.equal(await queue.heartbeat(first, 500, 1000), true)
    assert.equal(await queue.claim('other', 'attempt-other', 1100, 1000), null)
    const second = (await queue.claim('other', 'attempt-next', 1600, 1000))!
    assert.equal(second.attempts, 2)
    assert.equal(await queue.heartbeat(first, 1601, 1000), false)
    assert.equal(await queue.complete(first, result(first), 1601), false)
    assert.equal(
      await queue.complete(
        { ...second, connectionId: 'foreign' },
        result(second),
        1601,
      ),
      false,
    )
    await assert.rejects(
      queue.complete(
        second,
        {
          ...result(second),
          assets: [
            { ...result(second).assets[0]!, objectKey: 'other-site/key' },
          ],
        },
        1601,
      ),
      { statusCode: 400 },
    )
    assert.equal(await queue.complete(second, result(second), 1601), true)
    assert.equal(await queue.complete(first, result(first), 1602), false)
    assert.equal((await media.job('first'))?.state, 'succeeded')
    assert.equal(
      (
        await db
          .prepare('SELECT state FROM cloud_job_attempts WHERE attempt_id=?')
          .bind(first.attemptId)
          .first()
      ).state,
      'expired',
    )
    await enqueue('retry')
    const retry = (await queue.claim('worker', 'retry-1', 2000, 1000))!
    assert.equal(await queue.fail(retry, 'network_error', true, 2001), true)
    assert.equal(await queue.claim('worker', 'retry-early', 2500, 1000), null)
    const retry2 = (await queue.claim('worker', 'retry-2', 3100, 1000))!
    assert.equal(retry2.attempts, 2)
    await queue.fail(retry2, 'network_error', true, 3101)
    const retry3 = (await queue.claim('worker', 'retry-3', 5200, 1000))!
    assert.equal(retry3.attempts, 3)
    assert.equal(await queue.claim('worker', 'retry-4', 6300, 1000), null)
    assert.equal((await media.job('retry'))?.state, 'failed')
    await enqueue('deleted')
    const deleted = (await queue.claim('worker', 'deleted-1', 7000, 1000))!
    await media.deletePhoto('deleted')
    assert.equal(await queue.complete(deleted, result(deleted), 7001), false)
    assert.equal(await queue.heartbeat(deleted, 7001, 1000), false)
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) n FROM cloud_media_assets WHERE photo_id=?')
          .bind('deleted')
          .first()
      ).n,
      0,
    )
    await assert.rejects(
      createCloudExecutionRepository(db, { id: 2 }).heartbeat(
        deleted,
        7001,
        1000,
      ),
      { statusCode: 403 },
    )
    await enqueue('paused-race')
    await db.prepare('UPDATE platform_sites SET suspended=1 WHERE id=1').run()
    assert.equal(
      await queue.claim('worker', 'paused-attempt', 9000, 1000),
      null,
    )
    assert.equal(
      (
        await db
          .prepare(
            "SELECT attempts FROM cloud_processing_jobs WHERE id='paused-race'",
          )
          .first()
      ).attempts,
      0,
    )
    await db.prepare('UPDATE platform_sites SET suspended=0 WHERE id=1').run()
    const paused = (await queue.claim(
      'worker',
      'unpaused-attempt',
      9100,
      1000,
    ))!
    assert.equal(paused.attempts, 1)
    // Simulate a request that captured its clock before the deletion mark's lease expiry.
    await db.prepare('UPDATE platform_sites SET suspended=1 WHERE id=1').run()
    await db
      .prepare(
        "UPDATE cloud_processing_jobs SET lease_until=9500 WHERE id='paused-race'",
      )
      .run()
    assert.equal(await queue.heartbeat(paused, 9200, 1000), false)
    assert.equal(await queue.complete(paused, result(paused), 9200), false)
    assert.equal(await queue.fail(paused, 'network_error', true, 9200), false)
    assert.equal(
      (
        await db
          .prepare(
            "SELECT attempts FROM cloud_processing_jobs WHERE id='paused-race'",
          )
          .first()
      ).attempts,
      1,
    )
  } finally {
    await mf.dispose()
  }
})
