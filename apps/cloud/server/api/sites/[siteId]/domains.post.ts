import { getRouterParam } from 'h3'
import { DomainError, renameDefaultDomain } from '@chronoframe/platform/domains'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import { domainServices } from '../../../../../shared/platform/domains'
import {
  siteManagement,
  siteManagementBody,
} from '../../../utils/site-management'
export default definePlatformHandler(async (event) => {
  const { userId, store } = await siteManagement(event, true),
    siteId = Number(getRouterParam(event, 'siteId'))
  await store.get(userId, siteId)
  const body = await siteManagementBody(event),
    db = platformDatabase(event),
    { manager, config } = domainServices(db, useRuntimeConfig(event))
  if (
    body.action === 'rename' &&
    String(useRuntimeConfig(event).public.defaultDomainsReady) !== 'true'
  )
    throw new DomainError(503, 'domain_routing_unavailable')
  if (body.action === 'rename')
    return renameDefaultDomain(
      db,
      userId,
      siteId,
      { slug: body.slug, revision: body.revision },
      config.baseDomain,
    )
  if (body.action === 'default') return manager.defaultPrimary(userId, siteId)
  if (body.action === 'add')
    return { domain: await manager.request(userId, siteId, body.hostname) }
  if (
    !['pause', 'resume', 'delete', 'check', 'primary', 'redirects'].includes(
      String(body.action),
    ) ||
    typeof body.hostname !== 'string' ||
    typeof body.generation !== 'string' ||
    !Number.isSafeInteger(body.revision)
  )
    throw new DomainError(400, 'domain_invalid')
  const result = await manager.mutate(
    userId,
    siteId,
    body.hostname,
    body.generation,
    Number(body.revision),
    body.action as
      | 'pause'
      | 'resume'
      | 'delete'
      | 'check'
      | 'primary'
      | 'redirects',
    body.value === true,
  )
  if (['check', 'resume', 'delete', 'pause'].includes(String(body.action)))
    await manager.reconcile(body.hostname)
  return result
})
