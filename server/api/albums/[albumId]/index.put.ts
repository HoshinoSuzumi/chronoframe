import { z } from 'zod'
import {
  ALBUM_PASSWORD_MAX_LENGTH,
  ALBUM_PASSWORD_MIN_LENGTH,
} from '~~/shared/utils/album-password'
import { hashAlbumPassword } from '../../../utils/album-access'

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

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      isHidden: z.boolean().optional(),
      password: z
        .union([
          z.literal(''),
          z
            .string()
            .min(ALBUM_PASSWORD_MIN_LENGTH)
            .max(ALBUM_PASSWORD_MAX_LENGTH),
        ])
        .optional(),
    }).parse,
  )

  const db = useDB()

  // 检查相簿是否存在
  const album = await db
    .select()
    .from(tables.albums)
    .where(eq(tables.albums.id, albumId))
    .get()

  if (!album) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }

  const passwordHash =
    body.password !== undefined
      ? body.password
        ? await hashAlbumPassword(body.password)
        : null
      : undefined

  // 使用事务更新相簿
  const updatedAlbum = db.transaction((tx) => {
    // 更新基本信息
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    }

    if (body.title !== undefined) {
      updateData.title = body.title
    }

    if (body.description !== undefined) {
      updateData.description = body.description || null
    }

    if (body.coverPhotoId !== undefined) {
      updateData.coverPhotoId = body.coverPhotoId || null
    }
    if (body.isHidden !== undefined) {
      updateData.isHidden = body.isHidden
    }
    if (passwordHash !== undefined) {
      updateData.passwordHash = passwordHash
    }

    tx.update(tables.albums)
      .set(updateData)
      .where(eq(tables.albums.id, albumId))
      .run()

    // 如果提供了新的照片列表，替换现有照片
    if (body.photoIds !== undefined) {
      // 删除现有的相簌-照片关系
      tx.delete(tables.albumPhotos)
        .where(eq(tables.albumPhotos.albumId, albumId))
        .run()

      // 添加新的相簌-照片关系
      const photoIds = new Set(body.photoIds)

      // 确保 coverPhotoId 在列表中
      if (body.coverPhotoId) {
        photoIds.add(body.coverPhotoId)
      }

      if (photoIds.size > 0) {
        let pos = 1000000
        for (const photoId of photoIds) {
          tx.insert(tables.albumPhotos)
            .values({
              albumId,
              photoId,
              position: (pos += 10),
            })
            .onConflictDoNothing()
            .run()
        }
      }
    }

    return tx
      .select()
      .from(tables.albums)
      .where(eq(tables.albums.id, albumId))
      .get()
  })

  return {
    ...updatedAlbum,
    passwordHash: undefined,
    hasPassword: Boolean(updatedAlbum?.passwordHash),
  }
})
