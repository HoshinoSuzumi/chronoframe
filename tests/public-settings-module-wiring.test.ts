import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as tables from '../apps/self-hosted/server/database/schema.ts'

const require = createRequire(import.meta.url)
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'))
const { createJiti } = nuxtRequire('jiti')

function createPlatformDb(sqlite: Database.Database) {
  const db = {
    prepare: (sql: string) => {
      let values: (string | number | null)[] = []
      const statement = {
        bind: (...input: (string | number | null)[]) => {
          values = input
          return statement
        },
        first: async <T>() =>
          (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
        run: async () => ({
          meta: { changes: sqlite.prepare(sql).run(...values).changes },
        }),
      }
      return statement
    },
    batch: async (
      statements: { run(): Promise<{ meta: { changes: number } }> }[],
    ) => Promise.all(statements.map((statement) => statement.run())),
  }
  return db
}

test('Site public settings route projects reactionsEnabled through its real module wiring', async () => {
  const sqlite = new Database(':memory:')
  const previousRuntimeConfig = Object.getOwnPropertyDescriptor(
    globalThis,
    'useRuntimeConfig',
  )
  try {
    for (const file of (await readdir('packages/platform/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      sqlite.exec(
        await readFile(`packages/platform/migrations/${file}`, 'utf8'),
      )
    }
    sqlite.exec(
      `INSERT INTO platform_users(id,email,created_at) VALUES(1,'owner@example.com',1);
       INSERT INTO platform_workspaces(id,name) VALUES(1,'Workspace');
       INSERT INTO platform_sites(id,workspace_id,name,published,gallery_presentation) VALUES(1,1,'Gallery',1,'{"homeHeaderLayout":"embedded","socialLinks":{"links":[]},"reactionsEnabled":false}');
       INSERT INTO platform_domains(hostname,site_id,verified,active,kind) VALUES('gallery.example',1,1,1,'manual');`,
    )

    Object.assign(globalThis, {
      useRuntimeConfig: () => ({
        public: {
          defaultDomainsReady: false,
          siteBaseDomain: 'chronoframe.art',
        },
      }),
    })
    const { default: getPublicSettings } = await createJiti(import.meta.url, {
      moduleCache: false,
    }).import(resolve('apps/site/server/api/public/system/settings/all.get.ts'))
    const response = await (
      getPublicSettings as (event: unknown) => Promise<{
        data: Record<string, Record<string, unknown>>
      }>
    )({
      context: {
        cloudflare: {
          env: { DB: createPlatformDb(sqlite) },
          request: new Request(
            'https://gallery.example/api/public/system/settings/all',
          ),
        },
      },
    })

    assert.equal(response?.data.app?.reactionsEnabled, false)
  } finally {
    sqlite.close()
    if (previousRuntimeConfig)
      Object.defineProperty(
        globalThis,
        'useRuntimeConfig',
        previousRuntimeConfig,
      )
    else Reflect.deleteProperty(globalThis, 'useRuntimeConfig')
  }
})

test('Self-hosted public settings route emits stored reactionsEnabled as a boolean', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chronoframe-settings-'))
  const filename = join(directory, 'app.sqlite3')
  const sqlite = new Database(filename)
  const db = drizzle(sqlite, { schema: tables })
  migrate(db, {
    migrationsFolder: 'apps/self-hosted/server/database/migrations',
  })
  db.insert(tables.settings)
    .values({
      namespace: 'app',
      key: 'reactionsEnabled',
      type: 'boolean',
      value: 'false',
      defaultValue: 'true',
      isPublic: true,
    })
    .run()
  sqlite.close()

  const previousDatabaseUrl = process.env.DATABASE_URL
  const previousMigrations = process.env.DATABASE_MIGRATIONS
  const previousEventHandler = Object.getOwnPropertyDescriptor(
    globalThis,
    'eventHandler',
  )
  process.env.DATABASE_URL = filename
  process.env.DATABASE_MIGRATIONS = resolve(
    'apps/self-hosted/server/database/migrations',
  )
  Object.assign(globalThis, { eventHandler: (handler: unknown) => handler })
  let closeDatabase: (() => void) | undefined
  const jiti = createJiti(import.meta.url, {
    alias: {
      '~~': resolve('apps/self-hosted'),
      '~': resolve('apps/self-hosted/app'),
    },
  })
  try {
    const dbModule = await jiti.import(
      resolve('apps/self-hosted/server/utils/db.ts'),
    )
    closeDatabase = dbModule.closeDB as () => void
    const { default: getPublicSettings } = await jiti.import(
      resolve('apps/self-hosted/server/api/system/settings/all.get.ts'),
    )
    const response = await (
      getPublicSettings as () => Promise<{
        data: Record<string, Record<string, unknown>>
      }>
    )()
    assert.equal(response.data.app?.reactionsEnabled, false)
  } finally {
    closeDatabase?.()
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
    if (previousMigrations === undefined) delete process.env.DATABASE_MIGRATIONS
    else process.env.DATABASE_MIGRATIONS = previousMigrations
    if (previousEventHandler)
      Object.defineProperty(globalThis, 'eventHandler', previousEventHandler)
    else Reflect.deleteProperty(globalThis, 'eventHandler')
    await rm(directory, { recursive: true, force: true })
  }
})
