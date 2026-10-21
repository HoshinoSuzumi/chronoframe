import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { and, eq } from 'drizzle-orm'
import * as tables from '../apps/self-hosted/server/database/schema.ts'

test('settings emit effects only after persistence and restore an active config after reload failure', async () => {
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
    db.insert(tables.settings)
      .values([
        {
          namespace: 'system',
          key: 'queue.workerCount',
          type: 'number',
          value: '5',
        },
        { namespace: 'storage', key: 'provider', type: 'number', value: '1' },
      ])
      .run()
    db.insert(tables.settings_storage_providers)
      .values({
        id: 1,
        name: 'Original',
        provider: 'local',
        config: { provider: 'local', basePath: '/tmp/original' },
      })
      .run()
    const effects: string[] = []
    settingsManager.setRuntimeEffects({
      settingChanged(change) {
        const row = db
          .select()
          .from(tables.settings)
          .where(
            and(
              eq(tables.settings.namespace, change.namespace),
              eq(tables.settings.key, change.key),
            ),
          )
          .get()!
        assert.equal(row.value, String(change.value))
        effects.push(change.key)
      },
      async reloadStorageProvider(id) {
        assert.equal(id, 1)
        assert.equal(
          (await settingsManager.storage.getProviderById(id))!.name,
          'Broken',
        )
        throw new Error('construction failed')
      },
    })
    settingsManager.setInitializingFlag(true)
    await settingsManager.set('system', 'queue.workerCount', 2)
    assert.deepEqual(effects, [])
    settingsManager.setInitializingFlag(false)
    await settingsManager.set('system', 'queue.workerCount', 3)
    assert.deepEqual(effects, ['queue.workerCount'])
    await assert.rejects(
      settingsManager.set('system', 'queue.workerCount', 99),
      /between 1 and 8/,
    )
    assert.equal(await settingsManager.get('system', 'queue.workerCount'), 3)
    await assert.rejects(
      settingsManager.storage.updateProvider(1, {
        name: 'Broken',
        config: { provider: 'local', basePath: '/tmp/broken' },
      }),
      /construction failed/,
    )
    assert.equal(
      (await settingsManager.storage.getActiveProvider())!.name,
      'Original',
    )
    assert.deepEqual(
      (await settingsManager.storage.getActiveProvider())!.config,
      { provider: 'local', basePath: '/tmp/original' },
    )
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globals[key]
      else globals[key] = value
    }
    sqlite.close()
  }
})
