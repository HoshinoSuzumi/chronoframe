import { workspaceSettings } from '../../../../../../packages/platform/src/workspace-settings'
import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import { workspaceSettingsContext } from '../../../utils/workspace-settings'

export default definePlatformHandler(async (event) => {
  const { db, userId, workspaceId } = await workspaceSettingsContext(event)
  return { workspace: await workspaceSettings(db, userId, workspaceId) }
})
