import { z } from 'zod'
import { execMutation, getOne } from '~~/server/utils/db-query'
import { withDBTransaction } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireUserSession(event)

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

  // 检查相簌是否存在
  const album = await getOne(
    db.select().from(tables.albums).where(eq(tables.albums.id, albumId)),
  )

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  // 使用事务删除相簌及其关联的照片关系
  await withDBTransaction(async (tx) => {
    // 删除相簌-照片关系
    await execMutation(
      tx.delete(tables.albumPhotos).where(eq(tables.albumPhotos.albumId, albumId)),
    )

    // 删除相簌
    await execMutation(tx.delete(tables.albums).where(eq(tables.albums.id, albumId)))
  })

  return { success: true }
})
