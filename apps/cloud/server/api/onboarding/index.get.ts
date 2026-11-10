import { setResponseHeader } from 'h3'
import { accountSetup } from '../../../../../packages/platform/src/onboarding'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, false)
  const session = await requirePlatformSession(event, config)
  setResponseHeader(event, 'cache-control', 'no-store')
  return accountSetup(platformDatabase(event), session.userId)
})
