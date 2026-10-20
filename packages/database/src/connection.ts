import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.ts'

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

export interface DatabaseOptions {
  filename: string
  migrationsFolder?: string
  verbose?: (message: string) => void
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
    if (options.migrationsFolder)
      migrate(db, { migrationsFolder: options.migrationsFolder })
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
