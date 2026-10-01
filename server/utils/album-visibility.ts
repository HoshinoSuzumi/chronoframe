import { asc, eq, getTableColumns, or, isNotNull, ne, and } from 'drizzle-orm'
import type { useDB } from './db'
import type * as schema from '../database/schema'

/**
 * Returns the photos of a given album, stripping hidden-album members for
 * anonymous viewers and, unless explicitly allowed, other protected-album
 * members.
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

  if (loggedIn) {
    return rows
  }

  const excludedPhotoIds = (
    await db
      .select({ photoId: tables.albumPhotos.photoId })
      .from(tables.albumPhotos)
      .innerJoin(
        tables.albums,
        eq(tables.albumPhotos.albumId, tables.albums.id),
      )
      .where(
        includePasswordProtected
          ? eq(tables.albums.isHidden, true)
          : or(
              eq(tables.albums.isHidden, true),
              and(
                isNotNull(tables.albums.passwordHash),
                ne(tables.albums.id, albumId),
              ),
            ),
      )
      .all()
  ).map((r: { photoId: string }) => r.photoId)

  if (excludedPhotoIds.length === 0) {
    return rows
  }

  const excluded = new Set(excludedPhotoIds)
  return rows.filter((row: { id: string }) => !excluded.has(row.id))
}
