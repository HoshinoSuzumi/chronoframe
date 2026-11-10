import { setResponseHeader } from 'h3'
import { saveAccountSetup } from '../../../../../packages/platform/src/onboarding'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { siteManagementBody } from '../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event)
  platformPortalOrigin(event, config.platform.portalOrigin, true)
  const session = await requirePlatformSession(event, config.platform)
  setResponseHeader(event, 'cache-control', 'no-store')
  return saveAccountSetup(
    platformDatabase(event),
    session.userId,
    await siteManagementBody(event),
    config.public.siteBaseDomain,
  )
})
