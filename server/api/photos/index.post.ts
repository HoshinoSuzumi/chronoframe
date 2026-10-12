import path from 'path'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { eq } from 'drizzle-orm'
import { generateSafePhotoId } from '~~/server/utils/file-utils'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { prepareUpload } from '~~/server/utils/direct-upload'

const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4'])

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

const isVideoFile = (
  fileName: string,
  contentType?: string | null,
): boolean => {
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
  const session = await requireUserSession(event)
  const { storageProvider } = useStorageProvider(event)
  const t = await useTranslation(event)

  const body = await readBody(event)
  const { fileName, contentType, skipDuplicateCheck, fileSize, chunked } = body
  const isVideoUpload = fileName ? isVideoFile(fileName, contentType) : false

  if (!fileName) {
    throw createError({
      statusCode: 400,
      statusMessage: t('upload.error.required.title'),
    })
  }

  if (chunked || fileSize !== undefined) {
    const maxMB =
      (await settingsManager.get<number>('system', 'upload.maxFileSize')) ?? 256
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0)
      throw createError({ statusCode: 400, statusMessage: 'Invalid file size' })
    if (fileSize > maxMB * 1024 * 1024)
      throw createError({
        statusCode: 413,
        statusMessage: t('upload.error.tooLarge.title'),
      })
    const mime = useRuntimeConfig(event).upload.mime
    const allowed = mime.whitelist
      .split(',')
      .map((type: string) => type.trim())
      .filter(Boolean)
    if (
      mime.whitelistEnabled &&
      allowed.length &&
      !allowed.includes(contentType || 'application/octet-stream')
    ) {
      throw createError({
        statusCode: 415,
        statusMessage: t('upload.error.invalidType.title'),
      })
    }
    if (
      typeof fileName !== 'string' ||
      /[\\/]/.test(fileName) ||
      fileName === '.' ||
      fileName === '..'
    ) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file name' })
    }
  }

  try {
    const providerConfig = storageProvider.config
    const prefix =
      providerConfig && 'prefix' in providerConfig ? providerConfig.prefix : ''
    const objectKey = `${(prefix || '').replace(/\/+$/, '')}/${fileName}`

    // 重复文件检测
    const duplicateCheckEnabled =
      ((await settingsManager.get<boolean>(
        'system',
        'upload.duplicateCheck.enabled',
      )) ??
        true) &&
      !skipDuplicateCheck
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

      if (
        existingPhoto &&
        isVideoUpload &&
        isLikelyImageKey(existingPhoto.storageKey)
      ) {
        existingPhoto = null
      }

      if (existingPhoto) {
        const checkMode =
          (await settingsManager.get<'warn' | 'block' | 'skip'>(
            'system',
            'upload.duplicateCheck.mode',
          )) ?? 'skip'

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

    // Let the provider choose direct upload before considering a local receiver.
    {
      const upload = await prepareUpload(
        String(session.user.id),
        objectKey,
        fileSize,
        contentType || 'application/octet-stream',
        storageProvider,
        Boolean(chunked),
      )

      const response: any = {
        signedUrl: upload.url,
        upload,
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
