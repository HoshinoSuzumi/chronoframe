import { DEFAULT_SITE, type SiteContext } from '@chronoframe/core'
import { and, eq, max } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as tables from './schema.ts'

export const ALBUM_PHOTO_POSITION_START = 1_000_000
export const ALBUM_PHOTO_POSITION_GAP = 10
const INSERT_BATCH_SIZE = 200

type Database = ReturnType<typeof drizzle>
export type AlbumTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

/**
 * Returns the position of the last photo in the album. New photos are
 * appended after it with `ALBUM_PHOTO_POSITION_GAP` spacing.
 */
export const lastAlbumPhotoPosition = (
  tx: AlbumTransaction,
  albumId: number,
  site: SiteContext = DEFAULT_SITE,
): number => {
  const last = tx
    .select({ position: max(tables.albumPhotos.position) })
    .from(tables.albumPhotos)
    .where(
      and(
        eq(tables.albumPhotos.albumId, albumId),
        eq(tables.albumPhotos.siteId, site.id),
      ),
    )
    .get()

  return last?.position ?? ALBUM_PHOTO_POSITION_START
}

/**
 * Appends photos to the end of an album without changing existing
 * membership or order. Photos already in the album are skipped through the
 * unique album/photo index.
 *
 * Returns the number of membership rows actually inserted.
 */
export const appendAlbumPhotos = (
  tx: AlbumTransaction,
  albumId: number,
  photoIds: readonly string[],
  site: SiteContext = DEFAULT_SITE,
): number => {
  const uniqueIds = [...new Set(photoIds)]
  if (uniqueIds.length === 0) return 0

  let position = lastAlbumPhotoPosition(tx, albumId, site)
  let added = 0

  for (let index = 0; index < uniqueIds.length; index += INSERT_BATCH_SIZE) {
    const batch = uniqueIds.slice(index, index + INSERT_BATCH_SIZE)
    const result = tx
      .insert(tables.albumPhotos)
      .values(
        batch.map((photoId, offset) => ({
          siteId: site.id,
          albumId,
          photoId,
          position: position + (offset + 1) * ALBUM_PHOTO_POSITION_GAP,
        })),
      )
      .onConflictDoNothing()
      .run()

    position += batch.length * ALBUM_PHOTO_POSITION_GAP
    added += result.changes
  }

  return added
}

/**
 * Album membership is part of the album's state, so adding photos updates
 * its `updatedAt` timestamp. Callers must invoke this only when membership
 * actually changed.
 */
export const touchAlbum = (
  tx: AlbumTransaction,
  albumId: number,
  site: SiteContext = DEFAULT_SITE,
): void => {
  tx.update(tables.albums)
    .set({ updatedAt: new Date() })
    .where(
      and(eq(tables.albums.id, albumId), eq(tables.albums.siteId, site.id)),
    )
    .run()
}
