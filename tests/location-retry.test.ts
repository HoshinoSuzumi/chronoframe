import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as tables from '../apps/self-hosted/server/database/schema.ts'

test('retry endpoints authorize migration tasks before updating any tasks', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, {
    migrationsFolder: 'apps/self-hosted/server/database/migrations',
  })
  const globals = {
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
    useDB: () => db,
    tables,
  }
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  Object.assign(globalThis, globals)
  try {
    const { default: single } =
      await import('../apps/self-hosted/server/api/queue/task/retry.post.ts')
    const { default: batch } =
      await import('../apps/self-hosted/server/api/queue/task/retry-batch.post.ts')
    const seed = () => {
      db.delete(tables.pipelineQueue).run()
      db.insert(tables.pipelineQueue)
        .values([
          {
            id: 1,
            payload: { type: 'location-migration' },
            status: 'failed',
            attempts: 3,
            errorMessage: 'failure',
          },
          {
            id: 2,
            payload: { type: 'photo-reverse-geocoding', photoId: 'photo' },
            status: 'failed',
            attempts: 3,
            errorMessage: 'failure',
          },
        ])
        .run()
    }
    const state = () => db.select().from(tables.pipelineQueue).all()
    const callSingle = (taskId: number, admin = false) =>
      single({ body: { taskId }, admin } as never)
    const callBatch = (
      body: { taskIds?: number[]; retryAll?: boolean },
      admin = false,
    ) => batch({ body, admin } as never)
    for (const retry of [
      () => callSingle(1),
      () => callBatch({ taskIds: [2, 1] }),
      () => callBatch({ retryAll: true }),
    ]) {
      seed()
      const before = state()
      await assert.rejects(retry(), { statusCode: 403 })
      assert.deepEqual(
        state(),
        before,
        'rejected retries must not partially update tasks',
      )
    }
    seed()
    await callSingle(2)
    assert.equal(state().find((task) => task.id === 2)?.status, 'pending')
    seed()
    await callBatch({ taskIds: [2] })
    assert.equal(state().find((task) => task.id === 2)?.status, 'pending')
    seed()
    await callSingle(1, true)
    assert.equal(state().find((task) => task.id === 1)?.status, 'pending')
    seed()
    await callBatch({ retryAll: true }, true)
    assert.ok(
      state().every(
        (task) =>
          task.status === 'pending' &&
          task.attempts === 0 &&
          task.errorMessage === null,
      ),
    )
  } finally {
    sqlite.close()
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
