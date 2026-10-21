import { and, eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as tables from '../database/schema.ts'
import { QueueWarningCode } from '../../shared/utils/queue-warning.ts'
import { appendAlbumPhotos, touchAlbum } from './album-membership.ts'

export type AlbumAssignmentResult =
  | 'no-album'
  | typeof QueueWarningCode.AlbumMissing
  | 'already-added'
  | 'added'

export const persistPhotoWithAlbum = (
  db: ReturnType<typeof drizzle>,
  photo: typeof tables.photos.$inferInsert,
  albumId?: number,
): AlbumAssignmentResult =>
  db.transaction((tx) => {
    tx.insert(tables.photos)
      .values(photo)
      .onConflictDoUpdate({ target: tables.photos.id, set: photo })
      .run()

    if (albumId === undefined) return 'no-album'

    const album = tx
      .select({ id: tables.albums.id })
      .from(tables.albums)
      .where(eq(tables.albums.id, albumId))
      .get()
    if (!album) return QueueWarningCode.AlbumMissing

    const existing = tx
      .select({ id: tables.albumPhotos.id })
      .from(tables.albumPhotos)
      .where(
        and(
          eq(tables.albumPhotos.albumId, albumId),
          eq(tables.albumPhotos.photoId, photo.id),
        ),
      )
      .get()
    if (existing) return 'already-added'

    if (appendAlbumPhotos(tx, albumId, [photo.id]) === 0) {
      return 'already-added'
    }

    touchAlbum(tx, albumId)
    return 'added'
  })
