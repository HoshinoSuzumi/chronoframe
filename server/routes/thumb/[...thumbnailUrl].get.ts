import sharp from 'sharp'

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

  if (
    storageProvider.config?.provider === 'local' &&
    url.startsWith('/storage/')
  ) {
    const scheme = event.node.req.headers['x-forwarded-proto'] || 'http'
    url = `${scheme}://${event.node.req.headers.host}${url}`
  }

  const photo = await fetch(url)
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
