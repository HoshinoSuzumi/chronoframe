import { eq } from 'drizzle-orm'
import { assertPhotoAccess } from '../../utils/album-access'
import { tables, useDB } from '../../utils/db'

export default eventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)
  const key = getRouterParam(event, 'key')

  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key' })
  }
  const decodedKey = decodeURIComponent(key)
  if (decodedKey.split(/[\\/]/).some((part) => part === '..' || part === '.')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid key' })
  }

  const protectedMatch = /^__photo__\/([^/]+)\/(original|thumbnail|live)$/.exec(decodedKey)
  if (protectedMatch) {
    const [, photoId, kind] = protectedMatch
    const photo = useDB().select().from(tables.photos).where(eq(tables.photos.id, photoId)).get()
    if (!photo) {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
    const restricted = await assertPhotoAccess(event, photo.id)
    if (restricted) setHeader(event, 'Cache-Control', 'private, no-store')

    const targetUrl = kind === 'original'
      ? photo.originalUrl
      : kind === 'thumbnail'
        ? photo.thumbnailUrl
        : photo.livePhotoVideoUrl
    if (!targetUrl) {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }

    const scheme = event.node.req.headers['x-forwarded-proto'] || 'http'
    const host = event.node.req.headers.host
    const absoluteTarget = targetUrl.startsWith('/') && host
      ? `${scheme}://${host}${targetUrl}`
      : targetUrl
    const cookie = getHeader(event, 'cookie')
    const response = await fetch(absoluteTarget, cookie && targetUrl.startsWith('/')
      ? { headers: { cookie } }
      : undefined)
    if (!response.ok) {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
    const contentType = response.headers.get('content-type')
    if (contentType) setHeader(event, 'Content-Type', contentType)
    return Buffer.from(await response.arrayBuffer())
  }

  const restricted = await assertPhotoAccess(event, decodedKey)
  if (restricted) setHeader(event, 'Cache-Control', 'private, no-store')

  const photo = await storageProvider.get(decodedKey)
  if (!photo) {
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  }
  logger.chrono.info('Serve image from key', key)
  return photo
})
