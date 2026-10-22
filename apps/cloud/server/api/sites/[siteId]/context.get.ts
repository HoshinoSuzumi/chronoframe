import { definePlatformHandler } from '../../../../../platform.runtime'
import {
  portalSiteContext,
  siteContextDTO,
} from '../../../../../platform-context'
export default definePlatformHandler(async (event) =>
  siteContextDTO(
    event,
    await portalSiteContext(event, useRuntimeConfig(event).platform),
  ),
)
