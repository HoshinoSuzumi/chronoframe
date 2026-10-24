import { getRouterParam } from 'h3'
import { definePlatformHandler } from '../../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../../shared/platform/context'
import {
  authorizePublicPhoto,
  privateMedia,
} from '../../../../../../shared/platform/media'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event),
    id = getRouterParam(event, 'photoId') ?? ''
  await authorizePublicPhoto(event, context, id)
  return privateMedia(
    event,
    context.site.id,
    id,
    getRouterParam(event, 'role') ?? '',
  )
})
