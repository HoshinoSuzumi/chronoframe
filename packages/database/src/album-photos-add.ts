import { DEFAULT_SITE, type SiteContext } from '@chronoframe/core'
import { and, eq, inArray } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
type AddPhotosToAlbumResult = {
  added: number
  alreadyPresent: number
  missing: number
}
import * as tables from './schema.ts'
import { appendAlbumPhotos, touchAlbum } from './album-membership.ts'

export const addExistingPhotosToAlbum = (
  db: ReturnType<typeof drizzle>,
  albumId: number,
  photoIds: string[],
  site: SiteContext = DEFAULT_SITE,
): AddPhotosToAlbumResult | { error: 'album-not-found' } =>
  db.transaction((tx) => {
    const album = tx
      .select({ id: tables.albums.id })
      .from(tables.albums)
      .where(
        and(eq(tables.albums.id, albumId), eq(tables.albums.siteId, site.id)),
      )
      .get()
    if (!album) return { error: 'album-not-found' }

    const uniqueIds = [...new Set(photoIds)]
    const foundPhotoIds = new Set<string>()
    const existingIds = new Set<string>()
    for (let index = 0; index < uniqueIds.length; index += 400) {
      const ids = uniqueIds.slice(index, index + 400)
      const foundPhotos = tx
        .select({ id: tables.photos.id })
        .from(tables.photos)
        .where(
          and(
            inArray(tables.photos.id, ids),
            eq(tables.photos.siteId, site.id),
          ),
        )
        .all()
      for (const { id } of foundPhotos) foundPhotoIds.add(id)

      const memberships = tx
        .select({ photoId: tables.albumPhotos.photoId })
        .from(tables.albumPhotos)
        .where(
          and(
            eq(tables.albumPhotos.albumId, albumId),
            eq(tables.albumPhotos.siteId, site.id),
            inArray(tables.albumPhotos.photoId, ids),
          ),
        )
        .all()
      for (const { photoId } of memberships) existingIds.add(photoId)
    }

    const missingIds = uniqueIds.filter(
      (photoId) => !foundPhotoIds.has(photoId),
    )
    const appendableIds = uniqueIds.filter(
      (photoId) => foundPhotoIds.has(photoId) && !existingIds.has(photoId),
    )
    const added = appendAlbumPhotos(tx, albumId, appendableIds, site)
    if (added > 0) touchAlbum(tx, albumId, site)

    return {
      added,
      alreadyPresent: uniqueIds.length - added - missingIds.length,
      missing: missingIds.length,
    }
  })
