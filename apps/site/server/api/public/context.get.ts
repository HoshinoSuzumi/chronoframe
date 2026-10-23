import { definePlatformHandler } from '../../../../shared/platform/runtime'
import {
  publicSiteContext,
  siteContextDTO,
} from '../../../../shared/platform/context'
export default definePlatformHandler(async (event) =>
  siteContextDTO(event, await publicSiteContext(event)),
)
