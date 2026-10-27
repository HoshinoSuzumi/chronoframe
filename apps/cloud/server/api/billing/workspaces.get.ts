import { billingWorkspaces } from '../../../../../packages/platform/src/billing'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
export default definePlatformHandler(async (event) => {
  const user = await requirePlatformSession(
      event,
      useRuntimeConfig(event).platform,
    ),
    db = platformDatabase(event)
  return { workspaces: await billingWorkspaces(db, user.userId) }
})
