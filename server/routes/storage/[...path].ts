import { getStorageManager } from '../../plugins/3.storage'
import { assertPhotoAccess } from '../../utils/album-access'
import { serveLocalMedia } from '../../utils/local-media'

export default defineEventHandler(async (event) => {
  const provider = getStorageManager().getProvider()
  if (provider.config?.provider !== 'local') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  const key = decodeURIComponent(getRouterParam(event, 'path') || '')
  const restricted = await assertPhotoAccess(event, key)
  return serveLocalMedia(event, provider.config, key, restricted)
})
