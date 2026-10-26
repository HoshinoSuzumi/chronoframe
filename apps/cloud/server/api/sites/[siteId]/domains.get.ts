import { workspaceEntitlements } from '@chronoframe/platform/entitlements'
import { getRouterParam } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import {
  domainServices,
  syncDefaultDomain,
  legacySiteHost,
} from '../../../../../shared/platform/domains'
import { siteManagement } from '../../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event),
    siteId = Number(getRouterParam(event, 'siteId'))
  const site = await store.get(userId, siteId),
    db = platformDatabase(event),
    { config, manager } = domainServices(db, useRuntimeConfig(event))
  const defaultHostname = await syncDefaultDomain(
    db,
    siteId,
    site.slug,
    config.baseDomain,
  )
  return {
    customDomainLimit: (await workspaceEntitlements(db, site.workspaceId))
      .limits.customDomains,
    defaultHostname,
    legacyHostname: await legacySiteHost(db, siteId),
    baseDomain: config.baseDomain,
    cnameTarget: config.cnameTarget,
    enabled: config.enabled,
    routingReady: config.routingReady,
    defaultReady:
      String(useRuntimeConfig(event).public.defaultDomainsReady) === 'true',
    admin: site.role === 'admin',
    domains: await manager.list(userId, siteId),
  }
})
