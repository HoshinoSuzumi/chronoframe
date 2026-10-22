import { definePlatformHandler } from '../../../../platform.runtime'
import {
  platformAccess,
  platformRequestURL,
} from '../../../../platform.runtime'
export default definePlatformHandler(async (event) => {
  const context = await platformAccess(event).resolvePublicSite(
    platformRequestURL(event).hostname,
  )
  return { siteId: context.site.id, host: context.host }
})
