import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

import * as schema from '../database/schema.ts'

export const tables = schema
export { eq, and, or, inArray } from 'drizzle-orm'

// 创建单例数据库连接
let dbInstance: ReturnType<typeof drizzle> | null = null
let sqliteInstance: Database.Database | null = null

export function useDB() {
  if (!dbInstance || !sqliteInstance) {
    // 创建数据库连接，启用WAL模式以提高并发性能
    sqliteInstance = new Database('data/app.sqlite3', {
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
  }

  return dbInstance
}

// 优雅关闭数据库连接
export function closeDB() {
  if (sqliteInstance) {
    sqliteInstance.close()
    sqliteInstance = null
    dbInstance = null
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
