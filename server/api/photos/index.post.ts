import path from 'path'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { eq } from 'drizzle-orm'
import { generateSafePhotoId } from '~~/server/utils/file-utils'

const VIDEO_EXTENSIONS = new Set([
  '.mov',
  '.mp4',
])

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
])

const isVideoFile = (fileName: string, contentType?: string | null): boolean => {
  if (contentType?.toLowerCase().startsWith('video/')) {
    return true
  }

  const ext = path.extname(fileName).toLowerCase()
  return ext !== '' && VIDEO_EXTENSIONS.has(ext)
}

const isLikelyImageKey = (storageKey?: string | null): boolean => {
  if (!storageKey) {
    return false
  }

  const ext = path.extname(storageKey).toLowerCase()
  return ext !== '' && IMAGE_EXTENSIONS.has(ext)
}

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const config = useRuntimeConfig(event)
  const t = await useTranslation(event)

  const body = await readBody(event)
  const { fileName, contentType, skipDuplicateCheck } = body
  const { storageProvider } = useStorageProvider(event)
  const isVideoUpload = fileName ? isVideoFile(fileName, contentType) : false

  if (!fileName) {
    throw createError({
      statusCode: 400,
      statusMessage: t('upload.error.required.title'),
    })
  }

  try {
    const objectKey = `${(storageProvider.config?.prefix || '').replace(/\/+$/, '')}/${fileName}`

    // 重复文件检测
    const duplicateCheckEnabled =
      config.upload.duplicateCheck.enabled && !skipDuplicateCheck
    let existingPhoto = null

    if (duplicateCheckEnabled) {
      const photoId = generateSafePhotoId(objectKey)
      const db = useDB()

      existingPhoto = await db
        .select({
          id: tables.photos.id,
          title: tables.photos.title,
          storageKey: tables.photos.storageKey,
          originalUrl: tables.photos.originalUrl,
          thumbnailUrl: tables.photos.thumbnailUrl,
          dateTaken: tables.photos.dateTaken,
        })
        .from(tables.photos)
        .where(eq(tables.photos.id, photoId))
        .get()

      if (existingPhoto && isVideoUpload && isLikelyImageKey(existingPhoto.storageKey)) {
        existingPhoto = null
      }

      if (existingPhoto) {
        const checkMode = config.upload.duplicateCheck.mode || 'skip'

        if (checkMode === 'block') {
          // 阻止模式：直接拒绝上传
          throw createError({
            statusCode: 409,
            statusMessage: t('upload.duplicate.block.title'),
            data: {
              duplicate: true,
              existingPhoto,
              title: t('upload.duplicate.block.title'),
              message: t('upload.duplicate.block.message', { fileName }),
            },
          })
        } else if (checkMode === 'skip') {
          // 跳过模式：返回现有照片信息，不上传
          return {
            skipped: true,
            duplicate: true,
            existingPhoto,
            fileKey: objectKey,
            title: t('upload.duplicate.skip.title'),
            message: t('upload.duplicate.skip.message', { fileName }),
            info: t('upload.duplicate.skip.info', {
              dateTaken:
                existingPhoto.dateTaken || t('common.unknown', 'unknown date'),
            }),
          }
        }
        // 'warn' 模式：继续上传但返回警告信息
      }
    }

    // 若存储提供商支持预签名 URL，返回外部直传地址
    if (storageProvider.getSignedUrl) {
      const signedUrl = await storageProvider.getSignedUrl(objectKey, 3600, {
        contentType: contentType || 'application/octet-stream',
      })

      const response: any = {
        signedUrl,
        fileKey: objectKey,
        expiresIn: 3600,
      }

      if (existingPhoto) {
        response.duplicate = true
        response.existingPhoto = existingPhoto
        response.warningInfo = {
          title: t('upload.duplicate.warn.title'),
          message: t('upload.duplicate.warn.message', { fileName }),
          warning: t('upload.duplicate.warn.warning'),
          info: t('upload.duplicate.warn.info', {
            title: existingPhoto.title || fileName,
            dateTaken:
              existingPhoto.dateTaken || t('common.unknown', 'unknown date'),
          }),
        }
      }

      return response
    }

    // 否则回退到内部直传端点（需会话）
    const internalUploadUrl = `/api/photos/upload?key=${encodeURIComponent(objectKey)}`
    const response: any = {
      signedUrl: internalUploadUrl,
      fileKey: objectKey,
      expiresIn: 3600,
    }

    if (existingPhoto) {
      response.duplicate = true
      response.existingPhoto = existingPhoto
      response.warningInfo = {
        title: t('upload.duplicate.warn.title'),
        message: t('upload.duplicate.warn.message', { fileName }),
        warning: t('upload.duplicate.warn.warning'),
        info: t('upload.duplicate.warn.info', {
          title: existingPhoto.title || fileName,
          dateTaken:
            existingPhoto.dateTaken || t('common.unknown', 'unknown date'),
        }),
      }
    }

    return response
  } catch (error) {
    if ((error as any).statusCode) {
      throw error
    }
    logger.chrono.error('Failed to prepare upload:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to prepare upload',
    })
  }
})
