import { eq } from 'drizzle-orm'
import z from 'zod'
import { getAll } from '~~/server/utils/db-query'

export default eventHandler(async (event) => {
  const { photoId } = await getValidatedRouterParams(
    event,
    z.object({
      photoId: z.string(),
    }).parse,
  )

  const db = useDB()

  // 获取包含该照片的所有相册
  const albums = await getAll(
    db
      .select({
        id: tables.albums.id,
        title: tables.albums.title,
        description: tables.albums.description,
        coverPhotoId: tables.albums.coverPhotoId,
        createdAt: tables.albums.createdAt,
        updatedAt: tables.albums.updatedAt,
      })
      .from(tables.albums)
      .innerJoin(
        tables.albumPhotos,
        eq(tables.albums.id, tables.albumPhotos.albumId),
      )
      .where(eq(tables.albumPhotos.photoId, photoId)),
  )

  return albums
})
