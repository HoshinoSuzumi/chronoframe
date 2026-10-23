import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { createD1SiteCatalog } from '../../../../../packages/platform/src/index'
export default definePlatformHandler(async (event) => {
  const session = await requirePlatformSession(
    event,
    useRuntimeConfig(event).platform,
  )
  return {
    sites: await createD1SiteCatalog(platformDatabase(event)).list(
      session.userId,
    ),
  }
})
