import { definePlatformHandler } from '../../../../platform.runtime'
import {
  platformPortalOrigin,
  platformSession,
} from '../../../../platform.runtime'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin)
  const session = await platformSession(event, config.secret)
  return session
    ? { authenticated: true, user: { id: session.userId } }
    : { authenticated: false, user: null }
})
