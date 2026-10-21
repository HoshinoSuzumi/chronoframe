import { eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { asc, count, desc, eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as tables from '../database/schema.ts'

export const listUploadAlbumOptions = (db: ReturnType<typeof drizzle>) => {
  const albums = db
    .select({
      id: tables.albums.id,
      title: tables.albums.title,
      isHidden: tables.albums.isHidden,
      passwordHash: tables.albums.passwordHash,
      photoCount: count(tables.albumPhotos.id),
    })
    .from(tables.albums)
    .where(siteEq(tables.albums.siteId, DEFAULT_SITE.id))
    .leftJoin(
      tables.albumPhotos,
      eq(tables.albumPhotos.albumId, tables.albums.id),
    )
    .groupBy(tables.albums.id)
    .orderBy(asc(tables.albums.position), desc(tables.albums.createdAt))
    .all()

  return albums.map(({ passwordHash, ...album }) => ({
    ...album,
    hasPassword: Boolean(passwordHash),
  }))
}
