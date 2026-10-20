import { asc, desc, eq, getTableColumns, notInArray } from 'drizzle-orm'
import type { ResourceReadRepository } from '@chronoframe/core'
import { tables, type useDB } from '../utils/db.ts'
import { toAlbumDto, toPhotoDto } from '../utils/dto.ts'

/** Adapt existing SQLite queries without changing connections, schema or lifecycle. */
export function createSqliteResourceRepository(
  db: ReturnType<typeof useDB>,
): ResourceReadRepository {
  const albumRecord = (row: typeof tables.albums.$inferSelect) => ({
    resource: toAlbumDto(row),
    passwordHash: row.passwordHash,
  })
  return {
    async listPhotos(excludedIds = []) {
      return db
        .select()
        .from(tables.photos)
        .where(
          excludedIds.length
            ? notInArray(tables.photos.id, excludedIds)
            : undefined,
        )
        .orderBy(desc(tables.photos.dateTaken))
        .all()
        .map(toPhotoDto)
    },
    async listAlbums() {
      return db
        .select()
        .from(tables.albums)
        .orderBy(asc(tables.albums.position), desc(tables.albums.createdAt))
        .all()
        .map(albumRecord)
    },
    async getAlbum(id) {
      const row = db
        .select()
        .from(tables.albums)
        .where(eq(tables.albums.id, id))
        .get()
      return row ? albumRecord(row) : null
    },
    async listAlbumPhotoIds(id) {
      return db
        .select({ id: tables.albumPhotos.photoId })
        .from(tables.albumPhotos)
        .where(eq(tables.albumPhotos.albumId, id))
        .orderBy(asc(tables.albumPhotos.position))
        .all()
        .map((row) => row.id)
    },
    async listAlbumPhotos(id) {
      return db
        .select(getTableColumns(tables.photos))
        .from(tables.photos)
        .innerJoin(
          tables.albumPhotos,
          eq(tables.photos.id, tables.albumPhotos.photoId),
        )
        .where(eq(tables.albumPhotos.albumId, id))
        .orderBy(asc(tables.albumPhotos.position))
        .all()
        .map(toPhotoDto)
    },
    async listMemberships() {
      return db
        .select({
          photoId: tables.albumPhotos.photoId,
          albumId: tables.albums.id,
          hidden: tables.albums.isHidden,
          passwordHash: tables.albums.passwordHash,
        })
        .from(tables.albumPhotos)
        .innerJoin(
          tables.albums,
          eq(tables.albumPhotos.albumId, tables.albums.id),
        )
        .all()
        .map(({ passwordHash, ...membership }) => ({
          ...membership,
          protected: passwordHash !== null,
        }))
    },
  }
}
