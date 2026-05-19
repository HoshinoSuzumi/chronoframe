import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

let migrationPromise: Promise<void> | null = null
const migrationLogger = logger.dynamic('db-migrate')

async function runMigrations() {
  const dbPath = resolve(process.env.DATABASE_URL || './data/app.sqlite3')
  const migrationsFolderCandidates = [
    resolve('./server/database/migrations'),
    // `nuxi preview` runs with `Working directory: .output`, so we need to walk
    // back to the repo root to find the migrations.
    resolve('../server/database/migrations'),
  ]
  const migrationsFolder =
    migrationsFolderCandidates.find((candidate) =>
      existsSync(resolve(candidate, 'meta/_journal.json')),
    ) || migrationsFolderCandidates[0]

  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)

  try {
    const db = drizzle(sqlite)
    await migrate(db, {
      migrationsFolder,
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
