import { getRouterParam } from 'h3'
import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import {
  siteManagement,
  siteManagementBody,
} from '../../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event, true)
  const body = await siteManagementBody(event, 100000)
  return {
    site: await store.update(userId, Number(getRouterParam(event, 'siteId')), {
      name: body.name,
      revision: body.revision,
      published: body.published,
      profile: body.profile,
      presentation: body.presentation,
    }),
  }
})
