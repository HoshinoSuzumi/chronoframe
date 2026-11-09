import { getQuery, createError, setResponseHeader } from 'h3'
import { workspaceTrial } from '../../../../../packages/platform/src/trials'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, false)
  const user = await requirePlatformSession(event, config)
  const id = Number(getQuery(event).workspaceId)
  if (!Number.isSafeInteger(id) || id < 1)
    throw createError({ statusCode: 400 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return workspaceTrial(platformDatabase(event), user.userId, id)
})
