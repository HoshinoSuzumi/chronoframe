import { createSqliteJobRepository, reserveResource } from './sqlite-jobs.ts'
import { requireSite } from './site-repository.ts'
import { type SiteContext } from '@chronoframe/core'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { and, eq, min } from 'drizzle-orm'
import type {
  AlbumWriteRepository,
  PhotoWriteRepository,
} from '@chronoframe/core'
import { tables, type AppDatabase } from './connection.ts'
import { toAlbumDto, toPhotoDto } from './dto.ts'

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
    async createFirst(data, photoIds) {
      return db.transaction((tx) => {
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
        photoIds.forEach((photoId, index) =>
          tx
            .insert(tables.albumPhotos)
            .values({
              siteId: site.id,
              albumId: album.id,
              photoId,
              position: 1000000 + (index + 1) * 10,
            })
            .onConflictDoNothing()
            .run(),
        )
        return toAlbumDto(album)
      })
    },
    async update(id, data, photoIds) {
      return db.transaction((tx) => {
        const exists = tx
          .select({ id: tables.albums.id })
          .from(tables.albums)
          .where(
            siteAnd(
              eq(tables.albums.id, id),
              siteEq(tables.albums.siteId, site.id),
            ),
          )
          .get()
        if (!exists) return null
        tx.update(tables.albums)
          .set(data)
          .where(
            siteAnd(
              eq(tables.albums.id, id),
              siteEq(tables.albums.siteId, site.id),
            ),
          )
          .run()
        if (photoIds !== undefined) {
          tx.delete(tables.albumPhotos)
            .where(
              siteAnd(
                eq(tables.albumPhotos.albumId, id),
                siteEq(tables.albumPhotos.siteId, site.id),
              ),
            )
            .run()
          photoIds.forEach((photoId, index) =>
            tx
              .insert(tables.albumPhotos)
              .values({
                siteId: site.id,
                albumId: id,
                photoId,
                position: 1000000 + (index + 1) * 10,
              })
              .onConflictDoNothing()
              .run(),
          )
        }
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
        )
      })
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
    originalDerivedKey: photo.originalDerivedKey,
    storageReference: {
      connectionId: photo.storageConnectionId,
      revision: photo.storageRevision,
    },
  })
  return {
    async get(id) {
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
      return photo ? record(photo) : null
    },
    async beginMutation(id) {
      const photo = db
        .select()
        .from(tables.photos)
        .where(and(eq(tables.photos.siteId, site.id), eq(tables.photos.id, id)))
        .get()
      if (photo)
        reserveResource(db, site, id, {
          storageConnectionId: photo.storageConnectionId,
          storageRevision: photo.storageRevision,
          storageKey: photo.storageKey,
        })
    },
    async update(id, update, reverseGeocode) {
      return db.transaction(() => {
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
