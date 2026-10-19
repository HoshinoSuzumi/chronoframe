import { z } from 'zod'
import { and } from 'drizzle-orm'
import { requireAdminSession } from '../../../../utils/require-admin.ts'

export default eventHandler(async (event) => {
  await requireAdminSession(event)

  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const { photoId } = await getValidatedRouterParams(
    event,
    z.object({
      photoId: z.string(),
    }).parse,
  )

  const db = useDB()

  // 检查相簌-照片关系是否存在
  const relation = await db
    .select()
    .from(tables.albumPhotos)
    .where(
      and(
        eq(tables.albumPhotos.albumId, albumId),
        eq(tables.albumPhotos.photoId, photoId),
      ),
    )
    .get()

  if (!relation) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Photo not found in album',
    })
  }

  // 使用事务删除照片关系，如果该照片是封面则更新为 null
  db.transaction((tx) => {
    // 删除相簌-照片关系
    tx.delete(tables.albumPhotos)
      .where(
        and(
          eq(tables.albumPhotos.albumId, albumId),
          eq(tables.albumPhotos.photoId, photoId),
        ),
      )
      .run()

    // 如果该照片是封面，清除封面
    const album = tx
      .select()
      .from(tables.albums)
      .where(eq(tables.albums.id, albumId))
      .get()

    if (album && album.coverPhotoId === photoId) {
      tx.update(tables.albums)
        .set({ coverPhotoId: null, updatedAt: new Date() })
        .where(eq(tables.albums.id, albumId))
        .run()
    }
  })

  return { success: true }
})
