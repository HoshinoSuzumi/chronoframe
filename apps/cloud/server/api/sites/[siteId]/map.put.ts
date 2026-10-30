import { getRouterParam } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import {
  siteManagement,
  siteManagementBody,
} from '../../../utils/site-management'
import { saveSiteMaps } from '../../../../../../packages/platform/src/maps'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event, true)
  const siteId = Number(getRouterParam(event, 'siteId'))
  await store.get(userId, siteId)
  const body = await siteManagementBody(event, 8192)
  return saveSiteMaps(platformDatabase(event), userId, siteId, {
    config: body.config,
    revision: body.revision,
  })
})
