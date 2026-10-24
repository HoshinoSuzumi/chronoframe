import { PUBLIC_GALLERY_DEFAULTS } from '@chronoframe/contracts/gallery-settings'
import { definePlatformHandler } from '../../../../../../shared/platform/runtime'
import {
  publicSiteContext,
  siteContextDTO,
} from '../../../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const context = await siteContextDTO(event, await publicSiteContext(event))
  const data = structuredClone(PUBLIC_GALLERY_DEFAULTS) as Record<
    string,
    Record<string, unknown>
  >
  data.app!.title = context.name
  return { timestamp: Date.now(), data }
})
