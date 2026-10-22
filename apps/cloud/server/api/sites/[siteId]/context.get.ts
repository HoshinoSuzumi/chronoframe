import { definePlatformHandler } from '../../../../../platform.runtime'
import {
  platformAccess,
  platformPortalOrigin,
  platformSession,
} from '../../../../../platform.runtime'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin)
  const context = await platformAccess(event).authorizeSite(
    await platformSession(event, config.secret),
    Number(getRouterParam(event, 'siteId')),
    'read',
  )
  return {
    siteId: context.site.id,
    workspaceId: context.site.workspaceId,
    role: context.role,
  }
})
