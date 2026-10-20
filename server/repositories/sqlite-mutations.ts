import { and, eq, min } from 'drizzle-orm'
import type {
  AlbumWriteRepository,
  PhotoWriteRepository,
} from '@chronoframe/core'
import { tables, type useDB } from '../utils/db.ts'
import { toAlbumDto, toPhotoDto } from '../utils/dto.ts'

/** Keep album row and membership changes inside synchronous SQLite transactions. */
export function createSqliteAlbumWriteRepository(
  db: ReturnType<typeof useDB>,
): AlbumWriteRepository {
  return {
    async exists(id) {
      return Boolean(
        db
          .select({ id: tables.albums.id })
          .from(tables.albums)
          .where(eq(tables.albums.id, id))
          .get(),
      )
    },
    async createFirst(data, photoIds) {
      return db.transaction((tx) => {
        const row = tx
          .select({ min: min(tables.albums.position) })
          .from(tables.albums)
          .get()
        const album = tx
          .insert(tables.albums)
          .values({ ...data, position: (row?.min ?? 1000) - 1000 })
          .returning()
          .get()
        photoIds.forEach((photoId, index) =>
          tx
            .insert(tables.albumPhotos)
            .values({
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
          .where(eq(tables.albums.id, id))
          .get()
        if (!exists) return null
        tx.update(tables.albums).set(data).where(eq(tables.albums.id, id)).run()
        if (photoIds !== undefined) {
          tx.delete(tables.albumPhotos)
            .where(eq(tables.albumPhotos.albumId, id))
            .run()
          photoIds.forEach((photoId, index) =>
            tx
              .insert(tables.albumPhotos)
              .values({
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
            .where(eq(tables.albums.id, id))
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
            .where(eq(tables.albums.id, id))
            .get()
        )
          return false
        tx.delete(tables.albumPhotos)
          .where(eq(tables.albumPhotos.albumId, id))
          .run()
        tx.delete(tables.albums).where(eq(tables.albums.id, id)).run()
        return true
      })
    },
    async reorder(ids) {
      db.transaction((tx) => {
        ids.forEach((id, index) =>
          tx
            .update(tables.albums)
            .set({ position: index * 1000 })
            .where(eq(tables.albums.id, id))
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
            .where(predicate)
            .get()
        )
          return false
        tx.delete(tables.albumPhotos).where(predicate).run()
        tx.update(tables.albums)
          .set({ coverPhotoId: null, updatedAt })
          .where(
            and(
              eq(tables.albums.id, id),
              eq(tables.albums.coverPhotoId, photoId),
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
  db: ReturnType<typeof useDB>,
): PhotoWriteRepository {
  return {
    async get(id) {
      const photo = db
        .select()
        .from(tables.photos)
        .where(eq(tables.photos.id, id))
        .get()
      return photo ? toPhotoDto(photo) : null
    },
    async update(id, update) {
      db.update(tables.photos).set(update).where(eq(tables.photos.id, id)).run()
      const photo = db
        .select()
        .from(tables.photos)
        .where(eq(tables.photos.id, id))
        .get()
      return photo ? toPhotoDto(photo) : null
    },
    async delete(id) {
      db.delete(tables.photos).where(eq(tables.photos.id, id)).run()
    },
  }
}
