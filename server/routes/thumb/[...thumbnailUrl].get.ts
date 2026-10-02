import sharp from 'sharp'
import { assertPhotoAccess } from '../../utils/album-access'

export default eventHandler(async (event) => {
  const { storageProvider } = useStorageProvider(event)

  let url = getRouterParam(event, 'thumbnailUrl')

  if (!url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid thumbnailUrl',
    })
  }

  url = decodeURIComponent(url)
  const isAppPath = url.startsWith('/storage/') || url.startsWith('/image/')
  let absoluteUrl: URL | undefined
  if (!isAppPath) {
    try {
      absoluteUrl = new URL(url)
    } catch {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
    if (absoluteUrl.protocol !== 'http:' && absoluteUrl.protocol !== 'https:') {
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    }
  }
  const protectedPhotoMatch =
    /^\/image\/__photo__\/([^/]+)\/(?:thumbnail|original|live)$/.exec(url)
  const accessKey = protectedPhotoMatch
    ? decodeURIComponent(protectedPhotoMatch[1] || '')
    : isAppPath
      ? url.replace(/^\/(?:storage|image)\//, '')
      : url
  const restricted = await assertPhotoAccess(event, accessKey, !isAppPath)
  if (restricted) setHeader(event, 'Cache-Control', 'private, no-store')

  const shouldForwardCookieToStorage =
    storageProvider.config?.provider === 'local' &&
    (url.startsWith('/storage/') || url.startsWith('/image/'))

  if (
    storageProvider.config?.provider === 'local' &&
    (url.startsWith('/storage/') || url.startsWith('/image/'))
  ) {
    const scheme = event.node.req.headers['x-forwarded-proto'] || 'http'
    url = `${scheme}://${event.node.req.headers.host}${url}`
  }

  const cookie = getHeader(event, 'cookie')
  const photo = await fetch(
    url,
    cookie && shouldForwardCookieToStorage
      ? { headers: { cookie } }
      : undefined,
  )
    .then((res) => {
      if (!res.ok) {
        throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
      }
      return res.arrayBuffer()
    })
    .then((buf) => Buffer.from(buf))

  const sharpInst = sharp(photo).rotate()
  return await sharpInst.jpeg({ quality: 85 }).toBuffer()
})
