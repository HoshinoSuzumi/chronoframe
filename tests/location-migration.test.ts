import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import {
  enqueueLocationMigration,
  enqueueLocationMigrationRequest,
  getLocationMigrationStatus,
} from '../apps/self-hosted/server/services/pipeline-queue/location-migration.ts'

test('migration selects only old geocoded photos and deduplicates queue entries', () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE photos (
    id TEXT PRIMARY KEY, storage_key TEXT, latitude REAL, longitude REAL,
    country TEXT, city TEXT, location_name TEXT
  ); CREATE TABLE pipeline_queue (
    id INTEGER PRIMARY KEY, payload TEXT NOT NULL, priority INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending', status_stage TEXT, error_message TEXT, warning_code TEXT,
    available_at INTEGER DEFAULT 0, created_at INTEGER DEFAULT (unixepoch()), completed_at INTEGER
  );`)
  sqlite.exec(
    readFileSync(
      new URL(
        '../apps/self-hosted/server/database/migrations/0017_location_components.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  sqlite.exec(
    'ALTER TABLE photos ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1; ALTER TABLE pipeline_queue ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1; ALTER TABLE pipeline_queue ADD COLUMN storage_connection_id INTEGER; ALTER TABLE pipeline_queue ADD COLUMN storage_revision INTEGER NOT NULL DEFAULT 1; ALTER TABLE pipeline_queue ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1; ALTER TABLE pipeline_queue ADD COLUMN resource_id TEXT; ALTER TABLE pipeline_queue ADD COLUMN source_hash TEXT; ALTER TABLE pipeline_queue ADD COLUMN pipeline_version TEXT NOT NULL DEFAULT 1; ALTER TABLE pipeline_queue ADD COLUMN attempt_id TEXT; ALTER TABLE pipeline_queue ADD COLUMN worker_id TEXT; ALTER TABLE pipeline_queue ADD COLUMN lease_expires_at INTEGER; ALTER TABLE pipeline_queue ADD COLUMN heartbeat_at INTEGER;',
  )
  const db = drizzle(sqlite) as Parameters<typeof enqueueLocationMigration>[0]
  const insert = sqlite.prepare(
    'INSERT INTO photos(id,storage_key,latitude,longitude,country,city,location_name,geocoding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  insert.run(
    'legacy',
    '/legacy.jpg',
    0,
    121,
    'Country',
    'Old district',
    null,
    null,
  )
  insert.run('null-island', '/null.jpg', 0, 0, 'Country', 'Old', null, null)
  insert.run('gps-only', '/gps.jpg', 1, 1, null, null, null, null)
  insert.run('erased', '/erased.jpg', null, null, null, null, null, null)
  insert.run('invalid', '/invalid.jpg', 91, 0, null, 'Old', null, null)
  insert.run('empty', '/empty.jpg', 1, 1, ' ', '', '', null)
  insert.run(
    'modern',
    '/modern.jpg',
    1,
    1,
    'Country',
    'City',
    null,
    JSON.stringify({ version: 1, components: {} }),
  )
  insert.run('busy', '/busy.jpg', 1, 1, null, null, 'Old address', null)
  sqlite
    .prepare('INSERT INTO pipeline_queue (payload) VALUES (?)')
    .run(JSON.stringify({ type: 'photo-erase-location', photoId: 'busy' }))
  try {
    assert.deepEqual(getLocationMigrationStatus(db), {
      count: 2,
      requestActive: false,
    })
    assert.deepEqual(enqueueLocationMigration(db), {
      count: 2,
      queued: 1,
      alreadyQueued: 1,
    })
    assert.deepEqual(enqueueLocationMigration(db), {
      count: 2,
      queued: 0,
      alreadyQueued: 2,
    })
    const task = sqlite
      .prepare(
        'SELECT payload, priority FROM pipeline_queue ORDER BY id DESC LIMIT 1',
      )
      .get() as { payload: string; priority: number }
    assert.equal(task.priority, -1)
    assert.deepEqual(getLocationMigrationStatus(db), {
      count: 2,
      requestActive: true,
    })
    assert.deepEqual(JSON.parse(task.payload), {
      type: 'photo-reverse-geocoding',
      photoId: 'legacy',
      migrationOnly: true,
    })
    // Failed tasks can be retried on the next confirmed visit; checking alone never queues.
    sqlite.exec("UPDATE pipeline_queue SET status = 'failed' WHERE id = 2")
    assert.deepEqual(getLocationMigrationStatus(db), {
      count: 2,
      requestActive: false,
    })
    assert.deepEqual(enqueueLocationMigration(db), {
      count: 2,
      queued: 1,
      alreadyQueued: 1,
    })
    sqlite.exec("UPDATE photos SET geocoding = '{}' WHERE id = 'legacy'")
    assert.deepEqual(getLocationMigrationStatus(db), {
      count: 1,
      requestActive: true,
    })
    const requestId = enqueueLocationMigrationRequest(db)
    assert.equal(enqueueLocationMigrationRequest(db), requestId)
    sqlite
      .prepare("UPDATE pipeline_queue SET status = 'in-stages' WHERE id = ?")
      .run(requestId)
    assert.equal(enqueueLocationMigrationRequest(db), requestId)
    sqlite
      .prepare("UPDATE pipeline_queue SET status = 'completed' WHERE id = ?")
      .run(requestId)
    assert.notEqual(enqueueLocationMigrationRequest(db), requestId)
  } finally {
    sqlite.close()
  }
})

test('existing queue APIs accept migration tasks only for administrators', async () => {
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  const submitted: unknown[] = []
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireUserSession: async (event: { admin: boolean }) => ({
      user: { isAdmin: event.admin },
    }),
    readValidatedBody: async (
      event: { body: unknown },
      parse: (body: unknown) => unknown,
    ) => parse(event.body),
    createError: (options: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(options.statusMessage), options),
    __workerPool: {
      addTask: async (payload: unknown) => {
        submitted.push(payload)
        return 42
      },
    },
  })
  try {
    const { default: single } =
      await import('../apps/self-hosted/server/api/queue/add-task.post.ts')
    const { default: batch } =
      await import('../apps/self-hosted/server/api/queue/add-tasks.post.ts')
    const payload = { type: 'location-migration' }
    await assert.rejects(single({ admin: false, body: { payload } } as never), {
      statusCode: 403,
    })
    await assert.rejects(
      batch({ admin: false, body: { tasks: [{ payload }] } } as never),
      { statusCode: 403 },
    )
    const albumPayload = {
      type: 'photo',
      storageKey: 'image.jpg',
      albumId: 7,
    }
    await assert.rejects(
      single({ admin: false, body: { payload: albumPayload } } as never),
      { statusCode: 403 },
    )
    await assert.rejects(
      batch({
        admin: false,
        body: {
          tasks: [
            { payload: { type: 'photo', storageKey: 'plain.jpg' } },
            { payload: albumPayload },
          ],
        },
      } as never),
      { statusCode: 403 },
    )
    assert.equal(submitted.length, 0)
    assert.equal(
      (await single({ admin: true, body: { payload } } as never)).taskId,
      42,
    )
    assert.equal(
      (await batch({ admin: true, body: { tasks: [{ payload }] } } as never))
        .successCount,
      1,
    )
    assert.deepEqual(submitted, [payload, payload])
  } finally {
    for (const key of [
      'defineEventHandler',
      'requireUserSession',
      'readValidatedBody',
      'createError',
      '__workerPool',
    ]) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
