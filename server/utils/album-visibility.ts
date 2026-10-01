import { asc, eq, getTableColumns, or, isNotNull, ne, and } from 'drizzle-orm'
import type { useDB } from './db'
import type * as schema from '../database/schema'

/**
 * Returns the photos of a given album, optionally stripping those that also
 * appear in any hidden album (so anonymous viewers cannot reach them via a
 * public album).
 *
 * Kept as a small pure helper so the visibility contract can be exercised
 * from tests without spinning up the Nitro event-handler runtime. The
 * production handler in `server/api/albums/[albumId]/index.get.ts` delegates
 * to this helper.
 */
export async function fetchAlbumPhotos(
  db: ReturnType<typeof useDB>,
  tables: typeof schema,
  albumId: number,
  loggedIn: boolean,
  includePasswordProtected = loggedIn,
) {
  const rows = await db
    .select({
      ...getTableColumns(tables.photos),
    })
    .from(tables.photos)
    .innerJoin(
      tables.albumPhotos,
      eq(tables.photos.id, tables.albumPhotos.photoId),
    )
    .where(eq(tables.albumPhotos.albumId, albumId))
    .orderBy(asc(tables.albumPhotos.position))
    .all()

  if (includePasswordProtected) {
    return rows
  }

  const hiddenPhotoIds = (
    await db
      .select({ photoId: tables.albumPhotos.photoId })
      .from(tables.albumPhotos)
      .innerJoin(
        tables.albums,
        eq(tables.albumPhotos.albumId, tables.albums.id),
      )
      .where(
        or(
          eq(tables.albums.isHidden, true),
          and(
            isNotNull(tables.albums.passwordHash),
            ne(tables.albums.id, albumId),
          ),
        ),
      )
      .all()
  ).map((r: { photoId: string }) => r.photoId)

  if (hiddenPhotoIds.length === 0) {
    return rows
  }

  const hidden = new Set(hiddenPhotoIds)
  return rows.filter((row: { id: string }) => !hidden.has(row.id))
}
