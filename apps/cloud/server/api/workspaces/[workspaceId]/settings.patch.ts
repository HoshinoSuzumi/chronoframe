import { updateWorkspaceSettings } from '../../../../../../packages/platform/src/workspace-settings'
import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import { workspaceSettingsContext } from '../../../utils/workspace-settings'
import { siteManagementBody } from '../../../utils/site-management'

export default definePlatformHandler(async (event) => {
  const { db, userId, workspaceId } = await workspaceSettingsContext(
    event,
    true,
  )
  return {
    workspace: await updateWorkspaceSettings(
      db,
      userId,
      workspaceId,
      await siteManagementBody(event),
    ),
  }
})
