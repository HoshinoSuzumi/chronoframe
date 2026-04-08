import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { generateSafePhotoId } from '~~/server/utils/file-utils'

/**
 * 检查照片是否已存在
 * 可以检查单个或多个文件
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const t = await useTranslation(event)

  try {
    const { fileNames, storageKeys } = await readValidatedBody(
      event,
      z.object({
        fileNames: z.array(z.string()).optional(),
        storageKeys: z.array(z.string()).optional(),
      }).parse,
    )

    if (!fileNames && !storageKeys) {
      throw createError({
        statusCode: 400,
        statusMessage: t('upload.error.required.title'),
        data: {
          title: t('upload.error.required.title'),
          message: t('upload.error.required.message', {
            field: 'fileNames or storageKeys',
          }),
        },
      })
    }

    const db = useDB()
    const results = []

    // 检查文件名
    if (fileNames && fileNames.length > 0) {
      for (const fileName of fileNames) {
        // 生成 photoId（与上传时的逻辑相同）
        const { storageProvider } = useStorageProvider(event)
        const storageKey = `${(storageProvider.config?.prefix || '').replace(/\/+$/, '')}/${fileName}`
        const photoId = generateSafePhotoId(storageKey)

        // 查询数据库
        const existingPhoto = await db
          .select({
            id: tables.photos.id,
            title: tables.photos.title,
            storageKey: tables.photos.storageKey,
            originalUrl: tables.photos.originalUrl,
            thumbnailUrl: tables.photos.thumbnailUrl,
            dateTaken: tables.photos.dateTaken,
            fileSize: tables.photos.fileSize,
            width: tables.photos.width,
            height: tables.photos.height,
          })
          .from(tables.photos)
          .where(eq(tables.photos.id, photoId))
          .get()

        results.push({
          fileName,
          storageKey,
          photoId,
          exists: !!existingPhoto,
          photo: existingPhoto || null,
        })
      }
    }

    // 检查 storageKey
    if (storageKeys && storageKeys.length > 0) {
      for (const storageKey of storageKeys) {
        const photoId = generateSafePhotoId(storageKey)

        const existingPhoto = await db
          .select({
            id: tables.photos.id,
            title: tables.photos.title,
            storageKey: tables.photos.storageKey,
            originalUrl: tables.photos.originalUrl,
            thumbnailUrl: tables.photos.thumbnailUrl,
            dateTaken: tables.photos.dateTaken,
            fileSize: tables.photos.fileSize,
            width: tables.photos.width,
            height: tables.photos.height,
          })
          .from(tables.photos)
          .where(eq(tables.photos.id, photoId))
          .get()

        results.push({
          storageKey,
          photoId,
          exists: !!existingPhoto,
          photo: existingPhoto || null,
        })
      }
    }

    const duplicatesFound = results.filter((r) => r.exists).length

    return {
      success: true,
      results,
      duplicatesFound,
      summary: {
        title: t('upload.success.check.title'),
        message: t('upload.success.check.message', {
          total: results.length,
          duplicates: duplicatesFound,
        }),
      },
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: t('upload.error.uploadFailed.title'),
      data: {
        title: t('upload.error.uploadFailed.title'),
        message: error.message || t('upload.error.uploadFailed.message'),
      },
    })
  }
})
