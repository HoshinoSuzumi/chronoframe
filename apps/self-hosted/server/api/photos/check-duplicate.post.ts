import { DEFAULT_SITE } from '@chronoframe/core'
import { z } from 'zod'
import { createDuplicateChecker } from '@chronoframe/core'
import { createSqliteUploadRepository } from '../../repositories/sqlite-uploads'
import { useDB } from '../../utils/db'
import { useStorageProvider } from '../../utils/useStorageProvider'
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

    const { storageProvider } = useStorageProvider(event)
    const config = storageProvider.config
    const check = createDuplicateChecker({
      identifiers: { fromStorageKey: generateSafePhotoId },
      find: createSqliteUploadRepository(useDB(), DEFAULT_SITE).findDetails,
    })
    const results = await check(
      { fileNames, storageKeys },
      config && 'prefix' in config ? config.prefix : '',
    )

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
