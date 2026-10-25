import { DEFAULT_SITE } from '@chronoframe/core'
import type { AlbumPathResolution } from '@chronoframe/contracts/album-slug'
import { resolveAlbumPath } from '@chronoframe/database/album-slugs'
import { albumAccess } from '../../../utils/album-access'
import { useDB } from '../../../utils/db'

export default eventHandler(async (event) => {
  const segment = getRouterParam(event, 'slug') ?? ''
  const resolved = resolveAlbumPath(useDB(), DEFAULT_SITE, segment)
  const access = await albumAccess(event)
  if (!resolved || (resolved.isHidden && !access.admin))
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  const response: AlbumPathResolution = resolved
  return response
})
