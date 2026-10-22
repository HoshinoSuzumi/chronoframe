import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { and, eq } from 'drizzle-orm'
import * as tables from '../apps/self-hosted/server/database/schema.ts'

test('social links survive settings manager reads and invalid updates leave the row unchanged', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema: tables })
  migrate(db, {
    migrationsFolder: './apps/self-hosted/server/database/migrations',
  })
  const fakeLogger = { info() {}, warn() {}, error() {}, debug() {} }
  const globals = globalThis as unknown as Record<string, unknown>
  const overrides = {
    logger: { dynamic: () => fakeLogger },
    useDB: () => db,
    tables,
    and,
    eq,
  }
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, globals[key]]),
  )
  Object.assign(globals, overrides)
  try {
    const { settingsManager } =
      await import('../apps/self-hosted/server/services/settings/settingsManager.ts')
    await settingsManager.init([
      {
        namespace: 'app',
        key: 'socialLinks',
        type: 'json',
        defaultValue: { links: [] },
        isPublic: true,
      },
    ])
    const links = [
      'https://github.com/example',
      'https://instagram.com/example',
    ]
    await settingsManager.set('app', 'socialLinks', { links })
    assert.deepEqual(await settingsManager.get('app', 'socialLinks'), { links })

    await assert.rejects(
      settingsManager.set('app', 'socialLinks', {
        links: ['http://instagram.com/example'],
      }),
      /HTTPS/i,
    )
    const row = db
      .select()
      .from(tables.settings)
      .where(
        and(
          eq(tables.settings.namespace, 'app'),
          eq(tables.settings.key, 'socialLinks'),
        ),
      )
      .get()!
    assert.equal(row.isPublic, true)
    assert.deepEqual(JSON.parse(row.value!), { links })
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globals[key]
      else globals[key] = value
    }
    sqlite.close()
  }
})
