import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { pipelineQueue } from '../apps/self-hosted/server/database/schema.ts'

test('single task deletion only removes finished queue records', async (t) => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    'CREATE TABLE pipeline_queue (id INTEGER PRIMARY KEY, status TEXT NOT NULL, site_id INTEGER NOT NULL DEFAULT 1)',
  )
  const db = drizzle(sqlite)
  const globals = {
    defineEventHandler: (handler: unknown) => handler,
    requireUserSession: async (event: { authenticated: boolean }) => {
      if (!event.authenticated)
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    },
    getRouterParam: (event: { taskId: string }) => event.taskId,
    createError: (options: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(options.statusMessage), options),
    useDB: () => db,
    tables: { pipelineQueue },
  }
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  Object.assign(globalThis, globals)

  try {
    const { default: handler } =
      await import('../apps/self-hosted/server/api/queue/task/[taskId].delete.ts')
    const call = (taskId: string, authenticated = true) =>
      handler({ taskId, authenticated } as never)
    const seed = (status: string) => {
      sqlite.exec('DELETE FROM pipeline_queue')
      sqlite
        .prepare('INSERT INTO pipeline_queue (id,status) VALUES (1, ?), (2, ?)')
        .run(status, 'completed')
    }
    const remaining = () =>
      sqlite.prepare('SELECT id FROM pipeline_queue ORDER BY id').all()

    for (const status of ['completed', 'failed']) {
      await t.test(
        `deletes ${status} task without removing other records`,
        async () => {
          seed(status)
          assert.deepEqual(await call('1'), { success: true, taskId: 1 })
          assert.deepEqual(remaining(), [{ id: 2 }])
          await assert.rejects(call('1'), { statusCode: 404 })
        },
      )
    }

    for (const status of ['pending', 'in-stages']) {
      await t.test(
        `rejects ${status} task, including a task retried before deletion`,
        async () => {
          seed(status)
          await assert.rejects(call('1'), { statusCode: 409 })
          assert.deepEqual(remaining(), [{ id: 1 }, { id: 2 }])
        },
      )
    }

    await t.test('rejects invalid IDs and missing tasks', async () => {
      seed('completed')
      for (const id of ['', 'abc', '0', '-1', '1.5', '9007199254740992']) {
        await assert.rejects(call(id), { statusCode: 400 })
      }
      await assert.rejects(call('999'), { statusCode: 404 })
      assert.deepEqual(remaining(), [{ id: 1 }, { id: 2 }])
    })

    await t.test('requires authentication before deleting', async () => {
      seed('completed')
      await assert.rejects(call('1', false), { statusCode: 401 })
      assert.deepEqual(remaining(), [{ id: 1 }, { id: 2 }])
    })
  } finally {
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else Reflect.deleteProperty(globalThis, key)
    }
    sqlite.close()
  }
})
