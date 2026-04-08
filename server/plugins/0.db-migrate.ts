import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

let migrationPromise: Promise<void> | null = null
const migrationLogger = logger.dynamic('db-migrate')

async function runMigrations() {
  const dbPath = resolve(process.env.DATABASE_URL || './data/app.sqlite3')

  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)

  try {
    const db = drizzle(sqlite)
    await migrate(db, {
      migrationsFolder: resolve('./server/database/migrations'),
    })
    migrationLogger.info('Database migration finished successfully')
  } finally {
    sqlite.close()
  }
}

export default defineNitroPlugin(async () => {
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((error) => {
      migrationLogger.error('Database migration failed', error)
      throw error
    })
  }

  await migrationPromise
})
