import {
  DEFAULT_CNAME_TARGET,
  DEFAULT_SITE_BASE,
  defaultSiteHost,
  normalizeDomain,
  validSiteSlug,
} from '@chronoframe/contracts/domains'
import {
  createDomainManager,
  DomainError,
} from '../../../packages/platform/src/domains.ts'
import type {
  DomainConfig,
  DomainProvider,
} from '../../../packages/platform/src/domains.ts'
import type { PlatformD1 } from '../../../packages/platform/src/index.ts'
import { checkDomainCname, createDomainProvider } from './domain-provider.ts'

export function domainConfiguration(runtime: {
  public: { siteBaseDomain?: string }
  platform: Record<string, unknown>
}): DomainConfig {
  const p = runtime.platform
  return {
    baseDomain: normalizeDomain(
      runtime.public.siteBaseDomain || DEFAULT_SITE_BASE,
    ),
    cnameTarget: normalizeDomain(
      String(p.domainCnameTarget || DEFAULT_CNAME_TARGET),
    ),
    enabled:
      (p.domainEnabled === true || p.domainEnabled === 'true') &&
      !!p.domainProviderToken &&
      !!p.domainZoneId,
    routingReady:
      p.domainRoutingReady === true || p.domainRoutingReady === 'true',
    limit: Number(p.domainResourceLimit) || 20,
  }
}
export function domainServices(
  db: PlatformD1,
  runtime: {
    public: { siteBaseDomain?: string }
    platform: Record<string, unknown>
  },
) {
  const config = domainConfiguration(runtime),
    p = runtime.platform
  const unavailable = async () => {
    throw new DomainError(503, 'domain_unavailable')
  }
  const provider: DomainProvider = config.enabled
    ? createDomainProvider({
        token: String(p.domainProviderToken),
        zoneId: String(p.domainZoneId),
        siteWorker: String(p.domainSiteWorker || 'chronoframe-site'),
      })
    : {
        count: unavailable,
        find: unavailable,
        create: unavailable,
        get: unavailable,
        retry: unavailable,
        remove: unavailable,
        findRoute: unavailable,
        createRoute: unavailable,
        removeRoute: unavailable,
      }
  return {
    config,
    manager: createDomainManager(db, config, {
      dns: checkDomainCname,
      provider,
      id: () => crypto.randomUUID(),
    }),
  }
}
/** Install only exact default mappings; old DNS coverage can remain until an operator retires it. */
export async function syncDefaultDomain(
  db: PlatformD1,
  siteId: number,
  slug: string | null,
  base = DEFAULT_SITE_BASE,
) {
  if (!slug || !validSiteSlug(slug)) return null
  const host = defaultSiteHost(slug, base),
    legacy = slug + '.site.chronoframe.art'
  await db.batch([
    db
      .prepare(
        `INSERT INTO platform_site_slugs(slug,site_id) VALUES(?,?) ON CONFLICT DO NOTHING`,
      )
      .bind(slug, siteId),
    db
      .prepare(
        `INSERT INTO platform_domains(hostname,site_id,verified,active,kind) SELECT ?,id,1,1,'default' FROM platform_sites WHERE id=? AND slug=? AND EXISTS(SELECT 1 FROM platform_site_slugs WHERE slug=? AND site_id=?) ON CONFLICT(hostname) DO NOTHING`,
      )
      .bind(host, siteId, slug, slug, siteId),
    db
      .prepare(
        `UPDATE platform_domains SET kind='legacy',redirect_to=? WHERE hostname=? AND site_id=? AND EXISTS(SELECT 1 FROM platform_domains WHERE hostname=? AND site_id=?)`,
      )
      .bind(host, legacy, siteId, host, siteId),
  ])
  const owned = await db
    .prepare(
      'SELECT site_id FROM platform_domains WHERE hostname=? AND site_id=?',
    )
    .bind(host, siteId)
    .first()
  return owned ? host : null
}

/** Report only an existing compatible legacy mapping, rather than fabricating an old address. */
export async function legacySiteHost(db: PlatformD1, siteId: number) {
  const row = await db
    .prepare(
      `SELECT hostname FROM platform_domains WHERE site_id=? AND hostname LIKE '%.site.chronoframe.art' AND verified=1 AND active=1 AND (kind<>'alias' OR redirect_until>?) ORDER BY hostname LIMIT 1`,
    )
    .bind(siteId, Date.now())
    .first<{ hostname: string }>()
  return row?.hostname ?? null
}
