import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openDatabase } from '@chronoframe/database'
import { logger } from './logger.ts'
export { tables } from '@chronoframe/database'
export type {
  User,
  Photo,
  PipelineQueueItem,
  NewPipelineQueueItem,
  PhotoReaction,
  Album,
  NewAlbum,
  AlbumPhoto,
  NewAlbumPhoto,
  AlbumWithPhotos,
} from '@chronoframe/database'
export { eq, and, or, inArray } from 'drizzle-orm'

let connection: ReturnType<typeof openDatabase> | null = null
const databaseLogger = logger.dynamic('db')

/** Share the same configured connection for migrations and application queries. */
export function useDB() {
  connection ??= openDatabase({
    filename: resolve(process.env.DATABASE_URL || './data/app.sqlite3'),
    migrationsFolder: resolve(
      process.env.DATABASE_MIGRATIONS ||
        [
          './packages/database/migrations',
          '../../packages/database/migrations',
          './server/database/migrations',
        ].find((candidate) => existsSync(resolve(candidate))) ||
        './server/database/migrations',
    ),
    verbose:
      process.env.NODE_ENV === 'development'
        ? databaseLogger.verbose
        : undefined,
    logger: databaseLogger,
  })
  return connection.db
}

export function closeDB() {
  connection?.close()
  connection = null
}
