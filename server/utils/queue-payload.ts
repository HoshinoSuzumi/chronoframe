import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import * as tables from '../database/schema.ts'
import { useDB } from './db.ts'

export const queuePayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('location-migration') }),
  z.object({
    type: z.literal('photo'),
    storageKey: z.string().nonempty(),
    eraseLocation: z.boolean().optional(),
    albumId: z.number().int().positive().optional(),
  }),
  z
    .object({
      type: z.literal('live-photo-video'),
      storageKey: z.string().nonempty(),
    })
    .strict(),
  z.object({
    type: z.literal('photo-reverse-geocoding'),
    photoId: z.string().min(1),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  z.object({
    type: z.literal('photo-erase-location'),
    photoId: z.string().min(1),
  }),
])

export const queuePayloadRequiresAdmin = (
  payload: z.infer<typeof queuePayloadSchema>,
): boolean =>
  payload.type === 'location-migration' ||
  (payload.type === 'photo' && payload.albumId !== undefined)

export const photoTaskAlbumExists = (
  payload: z.infer<typeof queuePayloadSchema>,
  db?: ReturnType<typeof useDB>,
): boolean => {
  if (payload.type !== 'photo' || payload.albumId === undefined) return true

  const album = (db ?? useDB())
    .select({ id: tables.albums.id })
    .from(tables.albums)
    .where(
      siteAnd(
        eq(tables.albums.id, payload.albumId),
        siteEq(tables.albums.siteId, DEFAULT_SITE.id),
      ),
    )
    .get()

  return Boolean(album)
}

export const createPhotoTaskAlbumChecker = (db?: ReturnType<typeof useDB>) => {
  const cache = new Map<number, boolean>()

  return (payload: z.infer<typeof queuePayloadSchema>): boolean => {
    if (payload.type !== 'photo' || payload.albumId === undefined) return true

    const cached = cache.get(payload.albumId)
    if (cached !== undefined) return cached

    const exists = photoTaskAlbumExists(payload, db)
    cache.set(payload.albumId, exists)
    return exists
  }
}
