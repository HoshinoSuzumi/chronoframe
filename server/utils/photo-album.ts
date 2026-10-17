import { and, eq, max } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as tables from '../database/schema.ts'
import { QueueWarningCode } from '../../shared/utils/queue-warning.ts'

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

    const last = tx
      .select({ position: max(tables.albumPhotos.position) })
      .from(tables.albumPhotos)
      .where(eq(tables.albumPhotos.albumId, albumId))
      .get()

    const insertResult = tx
      .insert(tables.albumPhotos)
      .values({
        albumId,
        photoId: photo.id,
        position: (last?.position ?? 1000000) + 10,
      })
      .onConflictDoNothing()
      .run()

    return insertResult.changes > 0 ? 'added' : 'already-added'
  })
