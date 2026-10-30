import { getRouterParam } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import { siteManagement } from '../../../utils/site-management'
import { siteMaps } from '../../../../../../packages/platform/src/maps'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event)
  const siteId = Number(getRouterParam(event, 'siteId'))
  const site = await store.get(userId, siteId)
  return {
    ...(await siteMaps(platformDatabase(event), siteId)),
    role: site.role,
  }
})
