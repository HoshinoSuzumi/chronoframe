import { getRouterParam } from 'h3'
import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import { siteManagement } from '../../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event)
  return {
    site: await store.get(userId, Number(getRouterParam(event, 'siteId'))),
  }
})
