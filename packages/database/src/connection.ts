import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.ts'
import { backfillAlbumSlugs } from './album-slugs.ts'

export const tables = schema
export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>
export type User = typeof schema.users.$inferSelect
export type Photo = typeof schema.photos.$inferSelect
export type PipelineQueueItem = typeof schema.pipelineQueue.$inferSelect
export type NewPipelineQueueItem = typeof schema.pipelineQueue.$inferInsert
export type PhotoReaction = typeof schema.photoReactions.$inferSelect
export type Album = typeof schema.albums.$inferSelect
export type NewAlbum = typeof schema.albums.$inferInsert
export type AlbumPhoto = typeof schema.albumPhotos.$inferSelect
export type NewAlbumPhoto = typeof schema.albumPhotos.$inferInsert
export type AlbumWithPhotos = Album & { photos: Photo[] }

export interface DatabaseLogger {
  info(message: string): void
  warn(message: string, error?: unknown): void
}

export interface DatabaseOptions {
  filename: string
  migrationsFolder?: string
  verbose?: (message: string) => void
  logger?: DatabaseLogger
}

/** Open one explicitly configured SQLite connection; the caller owns its lifetime. */
export function openDatabase(options: DatabaseOptions) {
  if (options.filename !== ':memory:')
    mkdirSync(dirname(options.filename), { recursive: true })
  const sqlite = new Database(options.filename, {
    verbose: options.verbose
      ? (message) => options.verbose!(String(message))
      : undefined,
  })
  try {
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('busy_timeout = 5000')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('cache_size = 1000')
    sqlite.pragma('temp_store = MEMORY')
    const db = drizzle(sqlite, { schema })
    const logger = options.logger ?? {
      info: (message: string) => console.info(message),
      warn: (message: string, error?: unknown) => console.warn(message, error),
    }
    if (options.migrationsFolder) {
      migrateDatabase(db, options.migrationsFolder, options.filename)
      const slugTable = db.get<{ present: number }>(
        sql`SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='album_slugs'`,
      )
      if (slugTable) {
        try {
          const count = backfillAlbumSlugs(db)
          if (count) logger.info(`Backfilled album slugs for ${count} album(s)`)
        } catch (error) {
          logger.warn(
            'Album slug backfill failed; albums will fall back to numeric URLs',
            error,
          )
        }
      } else {
        const albumTable = db.get<{ present: number }>(
          sql`SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='albums'`,
        )
        if (
          albumTable &&
          db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM albums`)!
            .count
        )
          throw new Error(
            'album_slugs table is missing for existing albums; check DATABASE_MIGRATIONS',
          )
      }
    }
    return {
      db,
      /** SQLite backup includes committed WAL data and does not mutate the source. */
      backup: (filename: string) => sqlite.backup(filename),
      close: () => {
        if (sqlite.open) sqlite.close()
      },
    }
  } catch (error) {
    sqlite.close()
    throw error
  }
}

/** Stable persistence categories without exposing driver messages to clients. */
export function persistenceErrorCode(error: unknown) {
  const code = (error as { code?: string } | null)?.code ?? ''
  if (
    code.startsWith('SQLITE_CONSTRAINT_UNIQUE') ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  )
    return 'conflict'
  if (code.startsWith('SQLITE_CONSTRAINT')) return 'invalid-relation'
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'))
    return 'retryable'
  return 'internal'
}

/** Back up existing files before an unapplied migration; validate relations before committing. */
export function migrateDatabase(
  db: AppDatabase,
  migrationsFolder: string,
  filename?: string,
) {
  const journal = db.get<{ present: number }>(
    sql`SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`,
  )
  const applied = journal
    ? (db.get<{ timestamp: number }>(
        sql`SELECT max(created_at) AS timestamp FROM __drizzle_migrations`,
      )?.timestamp ?? 0)
    : 0
  const pending = readMigrationFiles({ migrationsFolder }).some(
    (m) => m.folderMillis > applied,
  )
  const existing = db.get<{ present: number }>(
    sql`SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='photos'`,
  )
  if (pending && existing && filename && filename !== ':memory:') {
    const backup = `${filename}.pre-migration-${Date.now()}-${randomUUID()}.sqlite3`
    db.run(sql`VACUUM INTO ${backup}`)
  }
  if (!pending) return
  db.run(sql`PRAGMA foreign_keys = OFF`)
  try {
    db.transaction(() => {
      db.run(
        sql`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)`,
      )
      for (const migration of readMigrationFiles({ migrationsFolder })) {
        if (migration.folderMillis <= applied) continue
        for (const statement of migration.sql)
          if (statement.trim()) db.run(sql.raw(statement))
        db.run(
          sql`INSERT INTO __drizzle_migrations(hash,created_at) VALUES (${migration.hash},${migration.folderMillis})`,
        )
      }
      if (db.all(sql`PRAGMA foreign_key_check`).length)
        throw new Error(
          'Migration violates database relations; restore the pre-migration backup',
        )
    })
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`)
  }
}
