import { fileTypeFromBuffer } from 'file-type'
import type { StorageProvider } from '~~/server/services/storage'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'
import { storeAvatar } from '~~/server/utils/avatar-store'
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_INPUT_BYTES,
} from '~~/shared/utils/avatar'

/**
 * POST /api/system/settings/avatar
 *
 * Process and store the application owner's avatar in the active storage
 * provider, then point `app:avatarUrl` at the public `/avatar/:file` route.
 * External URLs are still supported through the regular settings batch API.
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }

  const t = await useTranslation(event)

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.data?.length)

  if (!file?.data?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: t('upload.error.required.title'),
      data: {
        title: t('upload.error.required.title'),
        message: t('upload.error.required.message', { field: 'file' }),
      },
    })
  }

  if (file.data.length > AVATAR_MAX_INPUT_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: t('upload.error.tooLarge.title'),
      data: {
        title: t('upload.error.tooLarge.title'),
        message: t('upload.error.tooLarge.message', {
          size: (file.data.length / 1024 / 1024).toFixed(2),
        }),
        suggestion: t('upload.error.tooLarge.suggestion', {
          maxSize: AVATAR_MAX_INPUT_BYTES / 1024 / 1024,
        }),
      },
    })
  }

  const detected = await fileTypeFromBuffer(file.data)
  const isAllowed =
    detected !== undefined &&
    (AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(detected.mime)

  if (!isAllowed) {
    throw createError({
      statusCode: 415,
      statusMessage: t('upload.error.invalidType.title'),
      data: {
        title: t('upload.error.invalidType.title'),
        message: t('upload.error.invalidType.message', {
          type: detected?.mime ?? 'unknown',
        }),
        suggestion: t('upload.error.invalidType.suggestion', {
          allowed: AVATAR_ALLOWED_MIME_TYPES.join(', '),
        }),
      },
    })
  }

  const previousKey = await settingsManager.get<string>(
    'app',
    'avatarStorageKey',
  )

  let storageProvider: StorageProvider
  try {
    storageProvider = useStorageProvider(event).storageProvider
  } catch (error) {
    logger.chrono.error(
      'Storage provider unavailable for avatar upload:',
      error,
    )
    throw createError({
      statusCode: 500,
      statusMessage: t('upload.error.uploadFailed.title'),
      data: {
        title: t('upload.error.uploadFailed.title'),
        message: t('upload.error.uploadFailed.message'),
      },
    })
  }

  let stored: { url: string; key: string }
  try {
    stored = await storeAvatar(storageProvider, file.data)
  } catch (error) {
    logger.chrono.error('Failed to store avatar:', error)
    throw createError({
      statusCode: 500,
      statusMessage: t('upload.error.uploadFailed.title'),
      data: {
        title: t('upload.error.uploadFailed.title'),
        message: t('upload.error.uploadFailed.message'),
      },
    })
  }

  await settingsManager.set('app', 'avatarStorageKey', stored.key)
  await settingsManager.set('app', 'avatarUrl', stored.url)

  if (previousKey && previousKey !== stored.key) {
    await storageProvider.delete(previousKey).catch((error) => {
      logger.chrono.warn(
        `Failed to delete previous avatar ${previousKey}:`,
        error,
      )
    })
  }

  return { url: stored.url }
})
