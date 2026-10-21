import { appendAlbumPhotos, touchAlbum } from './album-membership.ts'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { type SiteContext } from '@chronoframe/core'
import { requireSite } from './site-repository.ts'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from './connection.ts'
import * as tables from './schema.ts'
import { QueueWarningCode } from '@chronoframe/contracts/queue'

export type AlbumAssignmentResult =
  | 'no-album'
  | typeof QueueWarningCode.AlbumMissing
  | 'already-added'
  | 'added'

export function createPhotoPersistenceRepository(
  db: AppDatabase,
  site: SiteContext,
) {
  requireSite(db, site)
  return {
    persist: (
      photo: typeof tables.photos.$inferInsert,
      albumId?: number,
    ): AlbumAssignmentResult =>
      db.transaction((tx) => {
        if (photo.siteId !== undefined && photo.siteId !== site.id)
          throw new RangeError('Photo belongs to a different Site')
        const ownedPhoto = { ...photo, siteId: site.id }
        tx.insert(tables.photos)
          .values(ownedPhoto)
          .onConflictDoUpdate({ target: tables.photos.id, set: ownedPhoto })
          .run()

        if (albumId === undefined) return 'no-album'

        const album = tx
          .select({ id: tables.albums.id })
          .from(tables.albums)
          .where(
            siteAnd(
              eq(tables.albums.id, albumId),
              siteEq(tables.albums.siteId, site.id),
            ),
          )
          .get()
        if (!album) return QueueWarningCode.AlbumMissing

        const existing = tx
          .select({ id: tables.albumPhotos.id })
          .from(tables.albumPhotos)
          .where(
            siteAnd(
              and(
                eq(tables.albumPhotos.albumId, albumId),
                eq(tables.albumPhotos.photoId, photo.id),
              ),
              siteEq(tables.albumPhotos.siteId, site.id),
            ),
          )
          .get()
        if (existing) return 'already-added'

        const added = appendAlbumPhotos(tx, albumId, [photo.id], site)
        if (added > 0) touchAlbum(tx, albumId, site)

        return added > 0 ? 'added' : 'already-added'
      }),
  }
}
