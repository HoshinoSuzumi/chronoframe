import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { validateSettingWrite } from '@chronoframe/core'
import type {
  SettingConfig,
  SettingValue,
} from '@chronoframe/contracts/settings'
import * as tables from '../apps/self-hosted/server/database/schema.ts'

const require = createRequire(import.meta.url)
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'))
const { createJiti } = nuxtRequire('jiti')
const jiti = createJiti(import.meta.url, {
  alias: { '#shared': resolve('apps/self-hosted/shared') },
  moduleCache: false,
})
const { DEFAULT_SETTINGS } = await jiti.import(
  resolve('apps/self-hosted/server/services/settings/contants.ts'),
)
const { getSettingUIConfig } = await jiti.import(
  resolve('apps/self-hosted/server/services/settings/ui-config.ts'),
)

function getReactionsSetting(): SettingConfig {
  const setting = (DEFAULT_SETTINGS as SettingConfig[]).find(
    ({ namespace, key }) => namespace === 'app' && key === 'reactionsEnabled',
  )
  assert.ok(setting, 'app:reactionsEnabled must be registered')
  return setting
}

test('public reactions setting defaults to true and uses the General Settings toggle', () => {
  const setting = getReactionsSetting()
  assert.deepEqual(setting, {
    namespace: 'app',
    key: 'reactionsEnabled',
    type: 'boolean',
    defaultValue: true,
    label: 'settings.app.reactionsEnabled.label',
    description: 'settings.app.reactionsEnabled.description',
    isPublic: true,
  })
  assert.deepEqual(getSettingUIConfig('app', 'reactionsEnabled'), {
    type: 'toggle',
  })
})

test('public reactions setting rejects non-boolean writes', () => {
  const input = {
    namespace: 'app',
    key: 'reactionsEnabled',
    readonly: false,
    enumValues: null,
    sudo: false,
  }
  validateSettingWrite({ ...input, value: true })
  validateSettingWrite({ ...input, value: false })

  for (const value of [null, 'false', 0, [], {}]) {
    assert.throws(
      () =>
        validateSettingWrite({
          ...input,
          value: value as SettingValue,
        }),
      /boolean/i,
    )
  }
})

test('settings initialization adds and persists reactions in an existing database', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema: tables })
  migrate(db, {
    migrationsFolder: './apps/self-hosted/server/database/migrations',
  })
  db.insert(tables.settings)
    .values({
      namespace: 'app',
      key: 'title',
      type: 'string',
      value: 'Existing gallery',
      defaultValue: 'ChronoFrame',
      isPublic: true,
    })
    .run()

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
    const getReactionsRow = () =>
      db
        .select()
        .from(tables.settings)
        .where(
          and(
            eq(tables.settings.namespace, 'app'),
            eq(tables.settings.key, 'reactionsEnabled'),
          ),
        )
        .get()!
    const { settingsManager } =
      await import('../apps/self-hosted/server/services/settings/settingsManager.ts')
    await settingsManager.init([getReactionsSetting()])

    assert.equal(await settingsManager.get('app', 'reactionsEnabled'), true)
    assert.equal(await settingsManager.get('app', 'title'), 'Existing gallery')

    await settingsManager.set('app', 'reactionsEnabled', false)
    assert.equal(await settingsManager.get('app', 'reactionsEnabled'), false)
    assert.equal(getReactionsRow().value, 'false')
    await settingsManager.set('app', 'reactionsEnabled', true)
    assert.equal(await settingsManager.get('app', 'reactionsEnabled'), true)
    assert.equal(getReactionsRow().value, 'true')

    for (const value of [null, 'true', 1, [], {}]) {
      await assert.rejects(
        settingsManager.set('app', 'reactionsEnabled', value as SettingValue),
        /boolean/i,
      )
    }

    const row = getReactionsRow()
    assert.equal(row.type, 'boolean')
    assert.equal(row.value, 'true')
    assert.equal(row.defaultValue, 'true')
    assert.equal(row.isPublic, true)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globals[key]
      else globals[key] = value
    }
    sqlite.close()
  }
})
