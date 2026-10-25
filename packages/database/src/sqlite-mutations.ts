import { appendAlbumPhotos } from './album-membership.ts'
import { createSqliteJobRepository } from './sqlite-jobs.ts'
import { createSiteRepository, requireSite } from './site-repository.ts'
import { CoreError, type SiteContext } from '@chronoframe/core'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { and, eq, min } from 'drizzle-orm'
import type {
  AlbumWriteRepository,
  PhotoWriteRepository,
} from '@chronoframe/core'
import { tables, type AppDatabase } from './connection.ts'
import { toAlbumDto, toPhotoDto } from './dto.ts'
import { claimAlbumSlug, getCurrentAlbumSlug } from './album-slugs.ts'

/** Keep album row and membership changes inside synchronous SQLite transactions. */
export function createSqliteAlbumWriteRepository(
  db: AppDatabase,
  site: SiteContext,
): AlbumWriteRepository {
  requireSite(db, site)
  return {
    async exists(id) {
      return Boolean(
        db
          .select({ id: tables.albums.id })
          .from(tables.albums)
          .where(
            siteAnd(
              eq(tables.albums.id, id),
              siteEq(tables.albums.siteId, site.id),
            ),
          )
          .get(),
      )
    },
    async createFirst(data, photoIds, requestedSlug = '') {
      return db.transaction(
        (tx) => {
          const row = tx
            .select({ min: min(tables.albums.position) })
            .from(tables.albums)
            .where(siteEq(tables.albums.siteId, site.id))
            .get()
          const album = tx
            .insert(tables.albums)
            .values({
              ...data,
              siteId: site.id,
              position: (row?.min ?? 1000) - 1000,
            })
            .returning()
            .get()
          appendAlbumPhotos(tx, album.id, photoIds, site)
          const slug = claimAlbumSlug(
            tx,
            site,
            album.id,
            album.title,
            requestedSlug,
          )
          return toAlbumDto(album, slug)
        },
        { behavior: 'immediate' },
      )
    },
    async update(id, data, photoIds, requestedSlug) {
      return db.transaction(
        (tx) => {
          const exists = tx
            .select({ id: tables.albums.id, title: tables.albums.title })
            .from(tables.albums)
            .where(
              siteAnd(
                eq(tables.albums.id, id),
                siteEq(tables.albums.siteId, site.id),
              ),
            )
            .get()
          if (!exists) return null
          if (Object.keys(data).length) {
            tx.update(tables.albums)
              .set(data)
              .where(
                siteAnd(
                  eq(tables.albums.id, id),
                  siteEq(tables.albums.siteId, site.id),
                ),
              )
              .run()
          }
          if (photoIds !== undefined) {
            tx.delete(tables.albumPhotos)
              .where(
                siteAnd(
                  eq(tables.albumPhotos.albumId, id),
                  siteEq(tables.albumPhotos.siteId, site.id),
                ),
              )
              .run()
            appendAlbumPhotos(tx, id, photoIds, site)
          }
          const slug =
            requestedSlug === undefined
              ? (getCurrentAlbumSlug(tx, site, id) ??
                claimAlbumSlug(tx, site, id, data.title ?? exists.title, ''))
              : claimAlbumSlug(
                  tx,
                  site,
                  id,
                  data.title ?? exists.title,
                  requestedSlug,
                )
          return toAlbumDto(
            tx
              .select()
              .from(tables.albums)
              .where(
                siteAnd(
                  eq(tables.albums.id, id),
                  siteEq(tables.albums.siteId, site.id),
                ),
              )
              .get()!,
            slug,
          )
        },
        { behavior: 'immediate' },
      )
    },
    async delete(id) {
      return db.transaction((tx) => {
        if (
          !tx
            .select({ id: tables.albums.id })
            .from(tables.albums)
            .where(
              siteAnd(
                eq(tables.albums.id, id),
                siteEq(tables.albums.siteId, site.id),
              ),
            )
            .get()
        )
          return false
        tx.delete(tables.albumPhotos)
          .where(
            siteAnd(
              eq(tables.albumPhotos.albumId, id),
              siteEq(tables.albumPhotos.siteId, site.id),
            ),
          )
          .run()
        tx.delete(tables.albums)
          .where(
            siteAnd(
              eq(tables.albums.id, id),
              siteEq(tables.albums.siteId, site.id),
            ),
          )
          .run()
        return true
      })
    },
    async reorder(ids) {
      db.transaction((tx) => {
        ids.forEach((id, index) =>
          tx
            .update(tables.albums)
            .set({ position: index * 1000 })
            .where(
              siteAnd(
                eq(tables.albums.id, id),
                siteEq(tables.albums.siteId, site.id),
              ),
            )
            .run(),
        )
      })
    },
    async removePhoto(id, photoId, updatedAt) {
      return db.transaction((tx) => {
        const predicate = and(
          eq(tables.albumPhotos.albumId, id),
          eq(tables.albumPhotos.photoId, photoId),
        )
        if (
          !tx
            .select({ id: tables.albumPhotos.id })
            .from(tables.albumPhotos)
            .where(
              siteAnd(predicate, siteEq(tables.albumPhotos.siteId, site.id)),
            )
            .get()
        )
          return false
        tx.delete(tables.albumPhotos)
          .where(siteAnd(predicate, siteEq(tables.albumPhotos.siteId, site.id)))
          .run()
        tx.update(tables.albums)
          .set({ coverPhotoId: null, updatedAt })
          .where(
            siteAnd(
              and(
                eq(tables.albums.id, id),
                eq(tables.albums.coverPhotoId, photoId),
              ),
              siteEq(tables.albums.siteId, site.id),
            ),
          )
          .run()
        return true
      })
    },
  }
}

/** Map photo writes at the existing connection boundary without changing its lifecycle. */
export function createSqlitePhotoWriteRepository(
  db: AppDatabase,
  site: SiteContext,
): PhotoWriteRepository {
  requireSite(db, site)
  const record = (photo: typeof tables.photos.$inferSelect) => ({
    ...toPhotoDto(photo),
    // Internal mutation records retain persisted targets, never presentation routes.
    originalUrl: photo.originalUrl,
    originalDerivedKey: photo.originalDerivedKey,
    storageReference: {
      connectionId: photo.storageConnectionId,
      revision: photo.storageRevision,
    },
  })
  return {
    async get(id) {
      const snapshot = await createSiteRepository(db, site).capturePhoto(id)
      return snapshot
        ? { ...record(snapshot.photo), mutationVersion: snapshot.version }
        : null
    },
    async update(id, update, reverseGeocode, expectedVersion) {
      return db.transaction(() => {
        if (expectedVersion !== undefined) {
          const version = db
            .select()
            .from(tables.resourceVersions)
            .where(
              and(
                eq(tables.resourceVersions.siteId, site.id),
                eq(tables.resourceVersions.resourceId, id),
              ),
            )
            .get()
          if (
            !version ||
            version.deleted ||
            version.version !== expectedVersion
          )
            throw new CoreError(409, 'Photo changed; retry the operation')
        }
        db.update(tables.photos)
          .set(update)
          .where(
            siteAnd(
              eq(tables.photos.id, id),
              siteEq(tables.photos.siteId, site.id),
            ),
          )
          .run()
        const photo = db
          .select()
          .from(tables.photos)
          .where(
            siteAnd(
              eq(tables.photos.id, id),
              siteEq(tables.photos.siteId, site.id),
            ),
          )
          .get()
        if (photo && reverseGeocode)
          createSqliteJobRepository(db, site, (payload) =>
            'photoId' in payload ? payload.photoId : null,
          ).enqueue(
            { type: 'photo-reverse-geocoding', photoId: id, ...reverseGeocode },
            { priority: 1 },
          )
        return photo ? toPhotoDto(photo) : null
      })
    },
    async delete(id) {
      return db.transaction(
        () => {
          const photo = db
            .select()
            .from(tables.photos)
            .where(
              and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)),
            )
            .get()
          if (!photo) return null
          db.delete(tables.photos)
            .where(
              and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)),
            )
            .run()
          return record(photo)
        },
        { behavior: 'immediate' },
      )
    },
  }
}
