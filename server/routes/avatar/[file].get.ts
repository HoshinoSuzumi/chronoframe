import type { StorageProvider } from '~~/server/services/storage'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import {
  avatarFileNameFromKey,
  isAvatarFileName,
} from '~~/server/utils/avatar-store'

/**
 * GET /avatar/:file
 *
 * Publicly serve the current avatar, fetched from the active storage provider.
 * Avatars are branding assets shown to anonymous visitors, so no session or
 * photo access check applies. Filenames are content-hashed, so responses are
 * immutable and can be cached aggressively.
 */
export default defineEventHandler(async (event) => {
  const fileName = getRouterParam(event, 'file') || ''
  if (!isAvatarFileName(fileName)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const key = await settingsManager.get<string>('app', 'avatarStorageKey')
  if (!key || avatarFileNameFromKey(key) !== fileName) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  let storageProvider: StorageProvider
  try {
    storageProvider = useStorageProvider(event).storageProvider
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  let buffer: Buffer | null
  try {
    buffer = await storageProvider.get(key)
  } catch (error) {
    logger.chrono.error('Failed to read avatar from storage:', error)
    buffer = null
  }

  if (!buffer) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const etag = `"${fileName}"`
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Type', 'image/webp')

  if (getHeader(event, 'if-none-match') === etag) {
    event.node.res.statusCode = 304
    return null
  }

  setHeader(event, 'Content-Length', buffer.length)
  return buffer
})
