import { definePlatformHandler } from '../../../../shared/platform/runtime'
import { siteManagement } from '../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event, true)
  return { workspace: await store.defaultWorkspace(userId) }
})
