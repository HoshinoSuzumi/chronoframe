import { definePlatformHandler } from '../../../../platform.runtime'
import { publicSiteContext, siteContextDTO } from '../../../../platform-context'
export default definePlatformHandler(async (event) =>
  siteContextDTO(event, await publicSiteContext(event)),
)
