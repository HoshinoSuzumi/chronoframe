import { DEFAULT_SITE } from '@chronoframe/core'
import {
  createPhotoPersistenceRepository,
  type AppDatabase,
  type tables,
} from '@chronoframe/database'
export type { AlbumAssignmentResult } from '@chronoframe/database'
/** Compatibility adapter for the embedded default Site. */
export function persistPhotoWithAlbum(
  db: AppDatabase,
  photo: typeof tables.photos.$inferInsert,
  albumId?: number,
) {
  return createPhotoPersistenceRepository(db, DEFAULT_SITE).persist(
    photo,
    albumId,
  )
}
