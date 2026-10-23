import { definePlatformHandler } from '../../../../../../platform.runtime'
import { publicSiteContext } from '../../../../../../platform-context'
import { visitorAccess } from '../../../../../../platform-visitor'
export default definePlatformHandler(async (event) =>
  visitorAccess(
    event,
    await publicSiteContext(event),
    Number(getRouterParam(event, 'albumId')),
    useRuntimeConfig(event).platform.secret,
  ),
)
