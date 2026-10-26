import { domainEligibility } from '../../../packages/platform/src/domain-policy'
import {
  defaultSiteHost,
  validSiteSlug,
} from '../../../packages/contracts/src/domains.ts'
import { platformStateKey } from '../../../packages/core/src/platform'
import { createD1SiteCatalog } from '../../../packages/platform/src/index'
import {
  CLOUD_CAPABILITIES,
  SITE_CAPABILITIES,
} from '../../../packages/contracts/src/entry'
import type { EntrySiteContext } from '../../../packages/contracts/src/entry'
import type {
  PortalContext,
  PublicSiteContext,
} from '../../../packages/core/src/platform'
import {
  platformAccess,
  platformDatabase,
  platformPortalOrigin,
  platformSession,
  platformRequestURL,
} from './runtime'
import { createError, getRouterParam } from 'h3'
import type { H3Event } from 'h3'

/** Resolve the route Site through the portal session and its live Membership. */
export async function portalSiteContext(
  event: H3Event,
  config: { portalOrigin: string; secret: string },
) {
  platformPortalOrigin(event, config.portalOrigin)
  return platformAccess(event).authorizeSite(
    await platformSession(event, config.secret),
    Number(getRouterParam(event, 'siteId')),
    'read',
  )
}
/** Resolve only published, verified mappings for the original Worker request Host. */
export async function publicSiteContext(event: H3Event) {
  return platformAccess(event).resolvePublicSite(
    platformRequestURL(event).hostname,
  )
}
/** Project a scoped UI context; public responses exclude Workspace and member details. */
export async function siteContextDTO(
  event: H3Event,
  context: PortalContext | PublicSiteContext,
): Promise<EntrySiteContext> {
  let canonicalOrigin: string | undefined
  if (context.kind === 'public') {
    const db = platformDatabase(event)
    const primary = await db
      .prepare(
        `SELECT hostname FROM platform_custom_domains WHERE site_id=? AND is_primary=1 AND state='active' AND verified_at>=?`,
      )
      .bind(context.site.id, Date.now() - 3600000)
      .first<{ hostname: string }>()
    const site = await db
      .prepare('SELECT slug FROM platform_sites WHERE id=?')
      .bind(context.site.id)
      .first<{ slug: string | null }>()
    const config = useRuntimeConfig(event)
    const candidate =
      site?.slug &&
      validSiteSlug(site.slug) &&
      String(config.public.defaultDomainsReady) === 'true'
        ? defaultSiteHost(site.slug, config.public.siteBaseDomain)
        : null
    const owned = candidate
      ? await db
          .prepare(
            'SELECT hostname FROM platform_domains WHERE hostname=? AND site_id=? AND verified=1 AND active=1',
          )
          .bind(candidate, context.site.id)
          .first()
      : null
    const primaryHost =
      primary && (await domainEligibility(db, primary.hostname)).allowed
        ? primary.hostname
        : null
    const host = primaryHost ?? (owned ? candidate! : context.host)
    canonicalOrigin = 'https://' + host
  }
  return {
    ...(canonicalOrigin ? { canonicalOrigin } : {}),
    siteId: context.site.id,
    name: await createD1SiteCatalog(platformDatabase(event)).name(
      context.site.id,
    ),
    scope: platformStateKey(context, 'ui'),
    published: context.site.published,
    audience: context.kind,
    capabilities:
      context.kind === 'portal' ? CLOUD_CAPABILITIES : SITE_CAPABILITIES,
    ...(context.kind === 'portal'
      ? { role: context.role, workspaceId: context.site.workspaceId }
      : {}),
  }
}
/** Require an unexpired platform session on the configured portal origin. */
export async function requirePlatformSession(
  event: H3Event,
  config: { portalOrigin: string; secret: string },
) {
  platformPortalOrigin(event, config.portalOrigin)
  const session = await platformSession(event, config.secret)
  if (!session)
    throw createError({
      statusCode: 401,
      statusMessage: 'Platform session required',
    })
  return session
}
