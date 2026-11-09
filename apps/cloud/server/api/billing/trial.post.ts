import { createError, setResponseHeader } from 'h3'
import { claimWorkspaceTrial } from '../../../../../packages/platform/src/trials'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { siteManagementBody } from '../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, true)
  const user = await requirePlatformSession(event, config)
  const body = await siteManagementBody(event)
  if (
    !Number.isSafeInteger(body.workspaceId) ||
    Number(body.workspaceId) < 1 ||
    body.confirmed !== true
  )
    throw createError({ statusCode: 400 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return claimWorkspaceTrial(
    platformDatabase(event),
    user.userId,
    Number(body.workspaceId),
    body.revision,
  )
})
