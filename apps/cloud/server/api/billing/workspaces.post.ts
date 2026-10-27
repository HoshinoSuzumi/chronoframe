import { billingWorkspaces } from '../../../../../packages/platform/src/billing'
import { createD1Provisioning } from '../../../../../packages/platform/src/index'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform,
    user = await requirePlatformSession(event, config)
  platformPortalOrigin(event, config.portalOrigin, true)
  const db = platformDatabase(event)
  await createD1Provisioning(db).defaultWorkspace(user.userId)
  return { workspaces: await billingWorkspaces(db, user.userId) }
})
