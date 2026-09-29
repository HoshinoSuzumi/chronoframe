import { asc, desc } from 'drizzle-orm'

export default eventHandler(async (_event) => {
  const db = useDB()

  // Fetch all albums ordered by position asc (createdAt desc as secondary sort)
  const albums = await db
    .select()
    .from(tables.albums)
    .orderBy(asc(tables.albums.position), desc(tables.albums.createdAt))

  // 为每个相册获取照片 ID 列表（避免循环引用）
  const albumsWithPhotoIds = await Promise.all(
    albums.map(async (album) => {
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
        // 即使是空相册，也返回空数组而不是 undefined
        photoIds: photoIds.length > 0 ? photoIds.map((p) => p.photoId) : [],
      }
    }),
  )

  // Already ordered by position asc at the SQL layer
  return albumsWithPhotoIds
})
