import { createError, getRouterParam } from 'h3'
import { resolveCloudAlbumPath } from '@chronoframe/database/cloud-album-slugs'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event)
  const resolved = await resolveCloudAlbumPath(
    platformDatabase(event) as unknown as MediaDatabase,
    context.site.id,
    getRouterParam(event, 'slug') ?? '',
  )
  if (!resolved || resolved.isHidden)
    throw createError({ statusCode: 404, statusMessage: 'Album not found' })
  return {
    albumId: resolved.albumId,
    slug: resolved.slug,
    isCanonical: resolved.isCanonical,
  }
})
