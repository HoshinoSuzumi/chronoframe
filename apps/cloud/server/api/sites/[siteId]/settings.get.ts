import {
  syncDefaultDomain,
  legacySiteHost,
} from '../../../../../shared/platform/domains'
import { platformDatabase } from '../../../../../shared/platform/runtime'
import { getRouterParam } from 'h3'
import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import { siteManagement } from '../../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event)
  const site = await store.get(userId, Number(getRouterParam(event, 'siteId')))
  const defaultHostname = await syncDefaultDomain(
    platformDatabase(event),
    site.siteId,
    site.slug,
    useRuntimeConfig(event).public.siteBaseDomain,
  )
  return {
    site: {
      ...site,
      defaultHostname,
      legacyHostname: await legacySiteHost(
        platformDatabase(event),
        site.siteId,
      ),
    },
  }
})
