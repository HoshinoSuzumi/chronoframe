import { DEFAULT_SITE } from '@chronoframe/core'
import { resolveAlbumPath } from '@chronoframe/database/album-slugs'
import { albumAccess } from '../utils/album-access'
import { useDB } from '../utils/db'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  const url = getRequestURL(event)
  const match = /^\/albums\/([^/]+)\/?$/.exec(url.pathname)
  if (!match) return
  let segment: string
  try {
    segment = decodeURIComponent(match[1]!)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }
  const resolved = resolveAlbumPath(useDB(), DEFAULT_SITE, segment)
  const access = await albumAccess(event)
  if (!resolved || (resolved.isHidden && !access.admin))
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  if (!resolved.isCanonical || url.pathname !== `/albums/${resolved.slug}`)
    return sendRedirect(event, `/albums/${resolved.slug}${url.search}`, 301)
})
