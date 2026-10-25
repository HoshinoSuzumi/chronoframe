import { requireSite } from './site-repository.ts'
import { type SiteContext } from '@chronoframe/core'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { and, asc, desc, eq, getTableColumns, notInArray } from 'drizzle-orm'
import type { ResourceReadRepository } from '@chronoframe/core'
import { tables, type AppDatabase } from './connection.ts'
import { toAlbumDto, toPhotoDto } from './dto.ts'

/** Adapt existing SQLite queries without changing connections, schema or lifecycle. */
export function createSqliteResourceRepository(
  db: AppDatabase,
  site: SiteContext,
): ResourceReadRepository {
  requireSite(db, site)
  const albumRecord = (
    row: typeof tables.albums.$inferSelect & { slug: string | null },
  ) => ({
    resource: toAlbumDto(row, row.slug),
    passwordHash: row.passwordHash,
  })
  return {
    async listPhotos(excludedIds = [], page) {
      if (
        page &&
        (!Number.isSafeInteger(page.limit) ||
          page.limit < 1 ||
          !Number.isSafeInteger(page.offset) ||
          page.offset < 0)
      )
        throw new RangeError('Invalid pagination')
      return db
        .select()
        .from(tables.photos)
        .where(
          siteAnd(
            excludedIds.length
              ? notInArray(tables.photos.id, excludedIds)
              : undefined,
            siteEq(tables.photos.siteId, site.id),
          ),
        )
        .orderBy(desc(tables.photos.dateTaken), asc(tables.photos.id))
        .limit(page?.limit ?? -1)
        .offset(page?.offset ?? 0)
        .all()
        .map(toPhotoDto)
    },
    async listAlbums() {
      return db
        .select({
          ...getTableColumns(tables.albums),
          slug: tables.albumSlugs.slug,
        })
        .from(tables.albums)
        .leftJoin(
          tables.albumSlugs,
          and(
            eq(tables.albumSlugs.siteId, tables.albums.siteId),
            eq(tables.albumSlugs.albumId, tables.albums.id),
            eq(tables.albumSlugs.isCurrent, true),
          ),
        )
        .where(siteEq(tables.albums.siteId, site.id))
        .orderBy(asc(tables.albums.position), desc(tables.albums.createdAt))
        .all()
        .map(albumRecord)
    },
    async getAlbum(id) {
      const row = db
        .select({
          ...getTableColumns(tables.albums),
          slug: tables.albumSlugs.slug,
        })
        .from(tables.albums)
        .leftJoin(
          tables.albumSlugs,
          and(
            eq(tables.albumSlugs.siteId, tables.albums.siteId),
            eq(tables.albumSlugs.albumId, tables.albums.id),
            eq(tables.albumSlugs.isCurrent, true),
          ),
        )
        .where(
          siteAnd(
            eq(tables.albums.id, id),
            siteEq(tables.albums.siteId, site.id),
          ),
        )
        .get()
      return row ? albumRecord(row) : null
    },
    async listAlbumPhotoIds(id) {
      return db
        .select({ id: tables.albumPhotos.photoId })
        .from(tables.albumPhotos)
        .where(
          siteAnd(
            eq(tables.albumPhotos.albumId, id),
            siteEq(tables.albumPhotos.siteId, site.id),
          ),
        )
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
        .where(
          siteAnd(
            eq(tables.albumPhotos.albumId, id),
            siteEq(tables.photos.siteId, site.id),
          ),
        )
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
        .where(siteEq(tables.albumPhotos.siteId, site.id))
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
