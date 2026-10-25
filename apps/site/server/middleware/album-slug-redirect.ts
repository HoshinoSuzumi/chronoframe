import { createError, sendRedirect, setResponseHeader } from 'h3'
import { resolveCloudAlbumPath } from '@chronoframe/database/cloud-album-slugs'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import {
  platformDatabase,
  platformRequestURL,
} from '../../../shared/platform/runtime'
import { publicSiteContext } from '../../../shared/platform/context'
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  const url = platformRequestURL(event)
  const match = /^\/albums\/([^/]+)\/?$/.exec(url.pathname)
  if (!match) return
  setResponseHeader(event, 'Cache-Control', 'no-store')
  let segment: string
  try {
    segment = decodeURIComponent(match[1]!)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  }
  const context = await publicSiteContext(event)
  const resolved = await resolveCloudAlbumPath(
    platformDatabase(event) as unknown as MediaDatabase,
    context.site.id,
    segment,
  )
  if (!resolved || resolved.isHidden)
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  if (!resolved.isCanonical || url.pathname !== `/albums/${resolved.slug}`)
    return sendRedirect(event, `/albums/${resolved.slug}${url.search}`, 301)
})
