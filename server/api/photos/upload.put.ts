import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { logger } from '~~/server/utils/logger'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const { storageProvider } = useStorageProvider(event)
  const key = getQuery(event).key as string | undefined
  const t = await useTranslation(event)

  if (!key) {
    throw createError({
      statusCode: 400,
      statusMessage: t('upload.error.required.title'),
      data: {
        title: t('upload.error.required.title'),
        message: t('upload.error.required.message', { field: 'key' }),
      },
    })
  }

  const contentType =
    getHeader(event, 'content-type') || 'application/octet-stream'

  // MIME 类型白名单验证（可通过环境变量配置）
  const config = useRuntimeConfig(event)
  const whitelistEnabled = config.upload.mime.whitelistEnabled

  if (whitelistEnabled) {
    const whitelistStr = config.upload.mime.whitelist
    const allowedTypes = whitelistStr
      ? whitelistStr
          .split(',')
          .map((type: string) => type.trim())
          .filter(Boolean)
      : []

    if (allowedTypes.length > 0 && !allowedTypes.includes(contentType)) {
      throw createError({
        statusCode: 415,
        statusMessage: t('upload.error.invalidType.title'),
        data: {
          title: t('upload.error.invalidType.title'),
          message: t('upload.error.invalidType.message', { type: contentType }),
          suggestion: t('upload.error.invalidType.suggestion', {
            allowed: allowedTypes.join(', '),
          }),
        },
      })
    }
  }

  const maxFileSizeMB =
    (await settingsManager.get<number>('system', 'upload.maxFileSize')) ?? 256
  const maxBytes = maxFileSizeMB * 1024 * 1024
  const stream = getRequestWebStream(event)
  if (!stream)
    throw createError({
      statusCode: 400,
      statusMessage: t('upload.error.uploadFailed.title'),
    })
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-upload-'))
  const filePath = path.join(directory, 'file')
  const reader = stream.getReader()
  let size = 0
  try {
    const file = await open(filePath, 'w')
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          throw createError({
            statusCode: 413,
            statusMessage: t('upload.error.tooLarge.title'),
          })
        }
        let written = 0
        while (written < value.byteLength) {
          const result = await file.write(
            value,
            written,
            value.byteLength - written,
          )
          if (!result.bytesWritten)
            throw new Error('Failed to write upload data')
          written += result.bytesWritten
        }
      }
    } finally {
      await file.close()
    }
    if (!size)
      throw createError({
        statusCode: 400,
        statusMessage: t('upload.error.uploadFailed.title'),
      })
    await storageProvider.createFromFile(key, filePath, contentType)
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    logger.chrono.error('Storage provider create error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: t('upload.error.uploadFailed.title'),
    })
  } finally {
    reader.releaseLock()
    await rm(directory, { recursive: true, force: true })
  }
  return { ok: true, key }
})
