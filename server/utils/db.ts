import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import Database from 'better-sqlite3'
import { Pool } from 'pg'

import * as schema from '../database/schema'
import { ensureBootstrapDbConfigSync } from './db-bootstrap'

export const tables = schema
export { eq, and, or, inArray } from 'drizzle-orm'

// 创建单例数据库连接
let dbInstance: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg> | null =
  null
let sqliteInstance: Database.Database | null = null
let pgPool: Pool | null = null
let currentAdapter: 'sqlite' | 'postgres' | null = null

function initializeDBIfNeeded() {
  if (dbInstance) {
    return dbInstance
  }

  const config = ensureBootstrapDbConfigSync()

  if (config.adapter === 'postgres') {
    pgPool = new Pool({
      connectionString: config.postgres.url,
      max: 20,
    })
    dbInstance = drizzlePg(pgPool, { schema })
    currentAdapter = 'postgres'
    return dbInstance
  }

  // 创建数据库连接，启用WAL模式以提高并发性能
  sqliteInstance = new Database(config.sqlite?.path || 'data/app.sqlite3', {
    verbose:
      process.env.NODE_ENV === 'development'
        ? logger.dynamic('db').verbose
        : undefined,
  })

  // 启用WAL模式以提高并发性能
  sqliteInstance.pragma('journal_mode = WAL')
  sqliteInstance.pragma('synchronous = NORMAL')
  sqliteInstance.pragma('cache_size = 1000')
  sqliteInstance.pragma('temp_store = MEMORY')

  dbInstance = drizzle(sqliteInstance, { schema })
  currentAdapter = 'sqlite'
  return dbInstance
}

export function useDB() {
  return initializeDBIfNeeded()
}

export async function initDB() {
  return initializeDBIfNeeded()
}

// 优雅关闭数据库连接
export async function closeDB() {
  if (sqliteInstance) {
    sqliteInstance.close()
    sqliteInstance = null
  }

  if (pgPool) {
    await pgPool.end()
    pgPool = null
  }

  dbInstance = null
  currentAdapter = null
}

export function getDatabaseAdapter(): 'sqlite' | 'postgres' {
  initializeDBIfNeeded()
  if (!currentAdapter) {
    return 'sqlite'
  }
  return currentAdapter
}

export async function withDBTransaction<T>(
  callback: (
    tx: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg>,
  ) => Promise<T>,
): Promise<T> {
  const db = useDB()
  const adapter = getDatabaseAdapter()

  if (adapter === 'postgres') {
    return (db as ReturnType<typeof drizzlePg>).transaction(async (tx) => {
      return callback(tx)
    })
  }

  const sqliteDb = sqliteInstance
  if (!sqliteDb) {
    throw new Error('SQLite connection is not initialized')
  }

  sqliteDb.exec('BEGIN')
  try {
    const result = await callback(db as ReturnType<typeof drizzle>)
    sqliteDb.exec('COMMIT')
    return result
  } catch (error) {
    sqliteDb.exec('ROLLBACK')
    throw error
  }
}

export type User = typeof schema.users.$inferSelect
export type Photo = typeof schema.photos.$inferSelect

export type PipelineQueueItem = typeof schema.pipelineQueue.$inferSelect
export type NewPipelineQueueItem = typeof schema.pipelineQueue.$inferInsert

export type PhotoReaction = typeof schema.photoReactions.$inferSelect

export type Album = typeof schema.albums.$inferSelect
export type NewAlbum = typeof schema.albums.$inferInsert
export type AlbumPhoto = typeof schema.albumPhotos.$inferSelect
export type NewAlbumPhoto = typeof schema.albumPhotos.$inferInsert
export type AlbumWithPhotos = Album & {
  photos: Photo[]
}
