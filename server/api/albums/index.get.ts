import { asc, desc, or, isNotNull, eq } from 'drizzle-orm'
import { albumAccess } from '../../utils/album-access'

export default eventHandler(async (event) => {
  const db = useDB()
  const { admin } = await albumAccess(event)
  const restrictedPhotoIds = admin ? new Set<string>() : new Set(
    db.select({ photoId: tables.albumPhotos.photoId })
      .from(tables.albumPhotos)
      .innerJoin(tables.albums, eq(tables.albumPhotos.albumId, tables.albums.id))
      .where(or(eq(tables.albums.isHidden, true), isNotNull(tables.albums.passwordHash)))
      .all().map((row) => row.photoId),
  )

  // Fetch all albums ordered by position asc (createdAt desc as secondary sort)
  const albums = await db
    .select()
    .from(tables.albums)
    .orderBy(asc(tables.albums.position), desc(tables.albums.createdAt))

  // 为每个相册获取照片 ID 列表（避免循环引用）
  const albumsWithPhotoIds = await Promise.all(
    albums.map(async (album) => {
      const accessible = admin || (!album.isHidden && !album.passwordHash)
      const photoIds = await db
        .select({
          photoId: tables.albumPhotos.photoId,
          position: tables.albumPhotos.position,
        })
        .from(tables.albumPhotos)
        .where(eq(tables.albumPhotos.albumId, album.id))
        .orderBy(tables.albumPhotos.position)

      return {
        ...album,
        passwordHash: undefined,
        hasPassword: Boolean(album.passwordHash),
        coverPhotoId: admin || (accessible && !restrictedPhotoIds.has(album.coverPhotoId || ''))
          ? album.coverPhotoId : null,
        // 即使是空相册，也返回空数组而不是 undefined
        photoIds: accessible ? photoIds.map((p) => p.photoId)
          .filter((id) => !restrictedPhotoIds.has(id)) : [],
      }
    }),
  )

  // Already ordered by position asc at the SQL layer
  return albumsWithPhotoIds
})
