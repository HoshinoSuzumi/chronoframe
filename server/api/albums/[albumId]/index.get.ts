import { asc, getTableColumns } from 'drizzle-orm'
import z from 'zod'
import { getAll, getOne } from '~~/server/utils/db-query'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const db = useDB()

  const album = await getOne(
    db.select().from(tables.albums).where(eq(tables.albums.id, albumId)),
  )

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // 获取相册中的照片
  const photos = await getAll(
    db
      // all fields from tables.photos
      .select({
        ...getTableColumns(tables.photos),
      })
      .from(tables.photos)
      .innerJoin(
        tables.albumPhotos,
        eq(tables.photos.id, tables.albumPhotos.photoId),
      )
      .where(eq(tables.albumPhotos.albumId, albumId))
      .orderBy(asc(tables.albumPhotos.position)),
  )

  // 验证相册数据完整性
  if (!photos || !Array.isArray(photos)) {
    // 空相册也是合法的，只需要返回空数组
    return {
      ...album,
      photos: [],
    }
  }

  return {
    ...album,
    photos,
  }
})
