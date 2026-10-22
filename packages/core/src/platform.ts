import { CoreError } from './errors.ts'
import { assertSiteContext, siteCacheKey } from './site.ts'
import type { SiteContext } from './site.ts'

export type MembershipRole = 'admin' | 'member'
export type SitePermission = 'read' | 'write' | 'manage'
export interface PlatformSession {
  /** Platform-local identity, resolved by a trusted session adapter. */
  userId: number
  expiresAt: number
}
export interface PlatformSite extends SiteContext {
  workspaceId: number
  published: boolean
}
export interface PlatformMembership {
  userId: number
  workspaceId: number
  role: MembershipRole
}
export interface PlatformDirectory {
  getSite(id: number): Promise<PlatformSite | null>
  getMembership(
    userId: number,
    workspaceId: number,
  ): Promise<PlatformMembership | null>
  /** Return active, ownership-verified Host mappings only. Never infer a default Site. */
  getPublishedSiteByHost(host: string): Promise<PlatformSite | null>
}
export interface PortalContext {
  readonly kind: 'portal'
  readonly site: Readonly<PlatformSite>
  readonly userId: number
  readonly role: MembershipRole
}
export interface PublicSiteContext {
  readonly kind: 'public'
  readonly site: Readonly<PlatformSite>
  readonly host: string
}
function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0
}
function validateSite(site: PlatformSite): void {
  assertSiteContext(site)
  if (!validId(site.workspaceId))
    throw new CoreError(503, 'Invalid platform directory result')
}

/** DNS hostname only: callers supply the direct URL hostname, never forwarded headers. */
export function normalizeSiteHost(input: string): string {
  if (typeof input !== 'string' || input.length > 254)
    throw new CoreError(400, 'Invalid Host')
  const host = input.toLowerCase().replace(/\.$/, '')
  if (
    !host ||
    host.length > 253 ||
    !host.includes('.') ||
    !host
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    /^[0-9.]+$/.test(host)
  )
    throw new CoreError(400, 'Invalid Host')
  return host
}

/** No session user, admin flag or selected Site from the client grants membership. */
export function createPlatformAccess(
  directory: PlatformDirectory,
  now = Date.now,
) {
  return {
    async authorizeSite(
      session: PlatformSession | null,
      siteId: number,
      permission: SitePermission,
    ): Promise<PortalContext> {
      if (
        !session ||
        !validId(session.userId) ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= now()
      ) {
        throw new CoreError(401, 'Platform session required')
      }
      if (!validId(siteId)) throw new CoreError(404, 'Site not found')
      if (!['read', 'write', 'manage'].includes(permission))
        throw new CoreError(403, 'Permission denied')
      const site = await directory.getSite(siteId)
      if (!site || site.id !== siteId)
        throw new CoreError(404, 'Site not found')
      validateSite(site)
      const membership = await directory.getMembership(
        session.userId,
        site.workspaceId,
      )
      // Treat missing membership as not found to avoid disclosing another tenant's Site.
      if (
        !membership ||
        membership.userId !== session.userId ||
        membership.workspaceId !== site.workspaceId
      ) {
        throw new CoreError(404, 'Site not found')
      }
      if (membership.role !== 'admin' && membership.role !== 'member')
        throw new CoreError(403, 'Permission denied')
      // Members can view content; mutation and membership/settings management require admin.
      if (permission !== 'read' && membership.role !== 'admin')
        throw new CoreError(403, 'Permission denied')
      return Object.freeze({
        kind: 'portal',
        site: Object.freeze({ ...site }),
        userId: session.userId,
        role: membership.role,
      })
    },
    async resolvePublicSite(
      requestHostname: string,
    ): Promise<PublicSiteContext> {
      const host = normalizeSiteHost(requestHostname)
      const site = await directory.getPublishedSiteByHost(host)
      if (!site || !site.published) throw new CoreError(404, 'Site not found')
      validateSite(site)
      return Object.freeze({
        kind: 'public',
        site: Object.freeze({ ...site }),
        host,
      })
    },
  }
}

/**
 * Separate audience and principal as well as Site.
 * Public keys are only for anonymous, unprotected resources. Visitor-protected
 * responses must be private/no-store and must not enter a shared public cache.
 */
export function platformCacheKey(
  context: PortalContext | PublicSiteContext,
  key: string,
): string {
  const audience =
    context.kind === 'portal'
      ? `portal:${context.userId}:${context.role}`
      : `public:${context.host.length}:${context.host}`
  return siteCacheKey(context.site, `${audience}:${key}`)
}

export interface SiteVisitorGrant {
  siteId: number
  albumId: number
  /** Opaque password revision; rotating a password invalidates previous grants. */
  revision: string
  expiresAt: number
}
/** Grant signatures/cookies are checked by the adapter before this scope check. */
export function hasSiteVisitorGrant(
  context: PublicSiteContext,
  grants: readonly SiteVisitorGrant[],
  albumId: number,
  revision: string,
  now = Date.now(),
): boolean {
  return (
    validId(albumId) &&
    !!revision &&
    grants.some(
      (grant) =>
        grant.siteId === context.site.id &&
        grant.albumId === albumId &&
        grant.revision === revision &&
        Number.isFinite(grant.expiresAt) &&
        grant.expiresAt > now,
    )
  )
}

/** A nonempty, framed scope for subscriptions and SSR state; no cross-tenant defaults. */
export function platformStateKey(
  context: PortalContext | PublicSiteContext,
  resource: string,
): string {
  if (!resource) throw new CoreError(400, 'A state resource is required')
  return platformCacheKey(context, resource)
}
