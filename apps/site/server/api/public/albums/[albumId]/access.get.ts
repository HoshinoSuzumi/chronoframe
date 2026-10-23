import { definePlatformHandler } from '../../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../../shared/platform/context'
import { visitorAccess } from '../../../../../../shared/platform/visitor'
export default definePlatformHandler(async (event) =>
  visitorAccess(
    event,
    await publicSiteContext(event),
    Number(getRouterParam(event, 'albumId')),
    useRuntimeConfig(event).platform.secret,
  ),
)
