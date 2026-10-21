import { settingsManager } from '~~/server/services/settings/settingsManager'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'

/**
 * DELETE /api/system/settings/avatar
 *
 * Remove the stored avatar from the active storage provider and reset
 * `app:avatarUrl` so the default fallback image is used again.
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }

  const key = await settingsManager.get<string>('app', 'avatarStorageKey')

  if (key) {
    try {
      const { storageProvider } = useStorageProvider(event)
      await storageProvider.delete(key)
    } catch (error) {
      logger.chrono.warn(`Failed to delete avatar ${key}:`, error)
    }
  }

  await settingsManager.set('app', 'avatarStorageKey', '')
  await settingsManager.set('app', 'avatarUrl', '')

  return { ok: true }
})
