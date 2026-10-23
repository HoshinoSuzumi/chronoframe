import { definePlatformHandler } from '../../../../shared/platform/runtime'
import { siteManagement, siteManagementBody } from '../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event, true)
  const body = await siteManagementBody(event)
  return {
    site: await store.create(userId, {
      name: body.name,
      slug: body.slug,
      requestId: body.requestId,
    }),
  }
})
