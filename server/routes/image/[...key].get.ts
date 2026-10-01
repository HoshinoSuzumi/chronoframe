import { assertPhotoAccess } from '../../utils/album-access'

export default eventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)
  const key = getRouterParam(event, 'key')

  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key' })
  }
  if (decodeURIComponent(key).split(/[\\/]/).some((part) => part === '..' || part === '.')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key' })
  }

  const restricted = await assertPhotoAccess(event, key)
  if (restricted) setHeader(event, 'Cache-Control', 'private, no-store')

  const photo = await storageProvider.get(key)
  if (!photo) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }
  logger.chrono.info('Serve image from key', key)
  return photo
})
