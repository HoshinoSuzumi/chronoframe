import { getRouterParam } from 'h3'
import { cloudMedia } from '../../../../../../utils/cloud-media'
import { definePlatformHandler } from '../../../../../../../../shared/platform/runtime'
import { privateMedia } from '../../../../../../../../shared/platform/media'
export default definePlatformHandler(async (event) => {
  const { siteId } = await cloudMedia(event)
  return privateMedia(
    event,
    siteId,
    getRouterParam(event, 'photoId') ?? '',
    getRouterParam(event, 'role') ?? '',
  )
})
