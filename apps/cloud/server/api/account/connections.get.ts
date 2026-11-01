import { setResponseHeader } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { accountConnections } from '../../../../../packages/platform/src/account-connections'
export default definePlatformHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin)
  const session = await requirePlatformSession(event, config)
  return accountConnections(
    platformDatabase(event),
    config.storageSecret,
    session.userId,
  )
})
