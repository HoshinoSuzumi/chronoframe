import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import {
  portalSiteContext,
  siteContextDTO,
} from '../../../../../shared/platform/context'
export default definePlatformHandler(async (event) =>
  siteContextDTO(
    event,
    await portalSiteContext(event, useRuntimeConfig(event).platform),
  ),
)
