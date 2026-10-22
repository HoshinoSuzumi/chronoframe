import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import {
  photos,
  pipelineQueue,
} from '../apps/self-hosted/server/database/schema.ts'

test('lightweight migration status is admin-only and includes active parent and child tasks', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, {
    migrationsFolder: 'apps/self-hosted/server/database/migrations',
  })
  let dbAccesses = 0
  const globals = {
    defineEventHandler: (handler: unknown) => handler,
    requireUserSession: async (event: { admin: boolean }) => ({
      user: { isAdmin: event.admin },
    }),
    createError: (options: { statusCode: number }) =>
      Object.assign(new Error(), options),
    useDB: () => {
      dbAccesses++
      return db
    },
  }
  const previous = Object.getOwnPropertyDescriptors(globalThis)
  Object.assign(globalThis, globals)
  try {
    const { default: status } =
      await import('../apps/self-hosted/server/api/location/migration-status.get.ts')
    await assert.rejects(status({ admin: false } as never), { statusCode: 403 })
    assert.equal(dbAccesses, 0)
    assert.deepEqual(await status({ admin: true } as never), {
      count: 0,
      requestActive: false,
    })
    db.insert(photos)
      .values({ id: 'legacy', latitude: 0, longitude: 121, city: 'Old' })
      .run()
    db.insert(pipelineQueue)
      .values({ payload: { type: 'location-migration' } })
      .run()
    assert.deepEqual(await status({ admin: true } as never), {
      count: 1,
      requestActive: true,
    })
    db.update(pipelineQueue).set({ status: 'completed' }).run()
    db.insert(pipelineQueue)
      .values({
        payload: {
          type: 'photo-reverse-geocoding',
          photoId: 'legacy',
          migrationOnly: true,
        },
        status: 'in-stages',
        priority: -1,
      })
      .run()
    assert.deepEqual(await status({ admin: true } as never), {
      count: 1,
      requestActive: true,
    })
    db.update(pipelineQueue).set({ status: 'failed' }).run()
    assert.deepEqual(await status({ admin: true } as never), {
      count: 1,
      requestActive: false,
    })
  } finally {
    sqlite.close()
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key])
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
