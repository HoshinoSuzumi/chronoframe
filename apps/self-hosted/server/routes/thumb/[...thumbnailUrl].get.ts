import { storageForPhoto } from '../../utils/object-storage'
import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { readFile } from 'node:fs/promises'
import { resolveLocalMediaPath } from '../../utils/local-media'
import { eq } from 'drizzle-orm'
import { tables, useDB } from '../../utils/db'
import sharp from 'sharp'
import { assertPhotoAccess } from '../../utils/album-access'

export default eventHandler(async (event) => {
  let { storageProvider } = useStorageProvider(event)

  let url = getRouterParam(event, 'thumbnailUrl')

  if (!url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid thumbnailUrl',
    })
  }

  url = decodeURIComponent(url)
  let isAppPath = url.startsWith('/storage/') || url.startsWith('/image/')
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

  if (protectedPhotoMatch) {
    const row = useDB()
      .select()
      .from(tables.photos)
      .where(
        siteAnd(
          eq(tables.photos.id, accessKey),
          siteEq(tables.photos.siteId, DEFAULT_SITE.id),
        ),
      )
      .get()
    const kind = url.split('/').pop()
    const resourceUrl =
      kind === 'original'
        ? row?.originalUrl
        : kind === 'live'
          ? row?.livePhotoVideoUrl
          : row?.thumbnailUrl
    if (!resourceUrl)
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    storageProvider = await storageForPhoto(accessKey, storageProvider)
    url = resourceUrl
    isAppPath = url.startsWith('/storage/') || url.startsWith('/image/')
  }

  let photo: Buffer
  if (storageProvider.config?.provider === 'local' && isAppPath) {
    let target = url
    if (!/^\/(?:storage|image)\//.test(target))
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    const localKey = decodeURIComponent(
      target.replace(/^\/(?:storage|image)\//, ''),
    )
    const targetRestricted = await assertPhotoAccess(event, localKey)
    if (targetRestricted) setHeader(event, 'Cache-Control', 'private, no-store')
    photo = await readFile(
      await resolveLocalMediaPath(storageProvider.config, localKey),
    )
  } else if (isAppPath) {
    const key = decodeURIComponent(url.replace(/^\/(?:storage|image)\//, ''))
    if (await assertPhotoAccess(event, key))
      setHeader(event, 'Cache-Control', 'private, no-store')
    const buffer = await storageProvider.get(key)
    if (!buffer)
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    photo = buffer
  } else {
    const response = await fetch(url)
    if (!response.ok)
      throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
    photo = Buffer.from(await response.arrayBuffer())
  }

  const sharpInst = sharp(photo).rotate()
  return await sharpInst.jpeg({ quality: 85 }).toBuffer()
})
