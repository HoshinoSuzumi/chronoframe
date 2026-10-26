import { domainEligibility } from './domain-policy.ts'
import { workspaceEntitlements } from './entitlements.ts'
import {
  DEFAULT_CNAME_TARGET,
  DEFAULT_SITE_BASE,
  defaultSiteHost,
  domainClaimTarget,
  normalizeDomain,
  validSiteSlug,
} from '@chronoframe/contracts/domains'
import type { CustomDomain, DomainStatus } from '@chronoframe/contracts/domains'
import type { PlatformD1, D1Statement } from './index.ts'

export class DomainError extends Error {
  statusCode: number
  code: string
  constructor(statusCode: number, code: string) {
    super(code)
    this.statusCode = statusCode
    this.code = code
  }
}
export interface DomainProvider {
  count(): Promise<number>
  find(
    hostname: string,
  ): Promise<{ id: string; status: string; ssl: string } | null>
  create(hostname: string): Promise<{ id: string; status: string; ssl: string }>
  get(id: string): Promise<{ id: string; status: string; ssl: string } | null>
  retry(id: string): Promise<void>
  remove(id: string): Promise<void>
  findRoute(hostname: string): Promise<{ id: string; owned: boolean } | null>
  createRoute(hostname: string): Promise<string>
  removeRoute(id: string, hostname: string): Promise<void>
}
export type DnsState = 'ready' | 'missing' | 'unknown'
export interface DomainConfig {
  baseDomain: string
  cnameTarget: string
  enabled: boolean
  routingReady: boolean
  limit: number
}
export const DOMAIN_HEALTH_TTL = 60 * 60 * 1000
const PENDING_LIMIT = 10
const HAS_PROVIDER =
  '(provider_attempted=1 OR provider_id IS NOT NULL OR route_attempted=1 OR route_id IS NOT NULL)'
const CLAIM_TTL = 48 * 60 * 60 * 1000
interface Row {
  hostname: string
  site_id: number
  generation: string
  revision: number
  state: DomainStatus
  dns_status: CustomDomain['dnsStatus']
  provider_id: string | null
  route_id: string | null
  provider_attempted: number
  route_attempted: number
  hostname_status: string
  ssl_status: string
  error: string | null
  is_primary: number
  redirects: number
  created_at: number
  checked_at: number | null
  expires_at: number
  next_check_at: number
  attempts: number
  lease_token: string | null
  retry_requested: number
  lease_until: number | null
  verified_at: number | null
  user_paused: number
  hold_reason: string | null
  purge_requested: number
  restore_primary: number
}
export function domainDTO(
  row: Row,
  target = DEFAULT_CNAME_TARGET,
): CustomDomain {
  return {
    hostname: row.hostname,
    siteId: row.site_id,
    generation: row.generation,
    cnameTarget: domainClaimTarget(row.generation, target),
    revision: row.revision,
    status: row.state,
    dnsStatus: row.dns_status,
    hostnameStatus: row.hostname_status,
    sslStatus: row.ssl_status,
    error: row.error,
    primary: !!row.is_primary,
    redirects: !!row.redirects,
    createdAt: row.created_at,
    checkedAt: row.checked_at,
    expiresAt: row.expires_at,
    nextCheckAt: row.next_check_at,
    holdReason: row.hold_reason as CustomDomain['holdReason'],
    cleanupPending:
      !!(
        row.provider_id ||
        row.route_id ||
        row.provider_attempted ||
        row.route_attempted
      ) &&
      (row.state === 'paused' || row.state === 'deleting'),
  }
}
/** Domain transitions retain their generation and database lease through external retries. */
export function createDomainManager(
  db: PlatformD1,
  config: DomainConfig,
  dependencies: {
    dns(host: string, target: string): Promise<DnsState>
    provider: DomainProvider
    id(): string
    now?(): number
  },
) {
  const now = dependencies.now ?? Date.now
  const stmt = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args)
  const base = normalizeDomain(config.baseDomain || DEFAULT_SITE_BASE)
  const target = normalizeDomain(config.cnameTarget || DEFAULT_CNAME_TARGET)
  const resourceLimit = Math.max(1, Math.min(config.limit, 20))
  const memberGuard = `EXISTS(SELECT 1 FROM platform_sites s JOIN platform_memberships m ON m.workspace_id=s.workspace_id WHERE s.id=? AND s.suspended=0 AND m.user_id=? AND m.role='admin')`
  async function authorize(userId: number, siteId: number, admin = true) {
    const row = await stmt(
      `SELECT s.id,s.slug,s.revision,m.role FROM platform_sites s JOIN platform_memberships m ON m.workspace_id=s.workspace_id WHERE s.id=? AND s.suspended=0 AND m.user_id=?`,
      siteId,
      userId,
    ).first<{ id: number; slug: string; revision: number; role: string }>()
    if (!row) throw new DomainError(404, 'domain_not_found')
    if (admin && row.role !== 'admin')
      throw new DomainError(403, 'domain_admin_required')
    return row
  }
  function audit(
    siteId: number,
    hostname: string,
    generation: string,
    action: string,
    userId: number | null,
    guard: string,
    args: (string | number | null)[],
  ): D1Statement {
    return stmt(
      `INSERT INTO platform_domain_audit(site_id,hostname,generation,action,user_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard})`,
      siteId,
      hostname,
      generation,
      action,
      userId,
      now(),
      ...args,
    )
  }
  async function list(userId: number, siteId: number) {
    await authorize(userId, siteId, false)
    const rows = await stmt(
      `SELECT json_group_array(json_object('hostname',hostname,'site_id',site_id,'generation',generation,'revision',revision,'state',state,'dns_status',dns_status,'hostname_status',hostname_status,'ssl_status',ssl_status,'error',error,'is_primary',is_primary,'redirects',redirects,'created_at',created_at,'checked_at',checked_at,'expires_at',expires_at,'next_check_at',next_check_at,'user_paused',user_paused,'hold_reason',hold_reason,'provider_attempted',provider_attempted,'route_attempted',route_attempted,'provider_id',provider_id,'route_id',route_id)) AS items FROM (SELECT * FROM platform_custom_domains WHERE site_id=? AND state<>'deleted' ORDER BY created_at)`,
      siteId,
    ).first<{ items: string }>()
    return Promise.all(
      (JSON.parse(rows?.items ?? '[]') as Row[]).map(async (row) => {
        const eligibility = await domainEligibility(db, row.hostname)
        const dto = domainDTO(row, target)
        if (!['deleting', 'expired'].includes(row.state)) {
          dto.holdReason = row.user_paused ? 'manual' : eligibility.reason
          if (!eligibility.allowed || row.user_paused) {
            dto.status = 'paused'
            dto.cleanupPending = !!(
              row.provider_id ||
              row.route_id ||
              row.provider_attempted ||
              row.route_attempted
            )
          } else if (row.state === 'paused') {
            dto.status = 'pending'
            dto.holdReason = null
          }
        }
        return dto
      }),
    )
  }
  async function request(userId: number, siteId: number, input: unknown) {
    await authorize(userId, siteId)
    if (!config.enabled) throw new DomainError(503, 'domain_unavailable')
    let host: string
    try {
      host = normalizeDomain(input)
    } catch {
      throw new DomainError(400, 'domain_invalid')
    }
    if (
      host === DEFAULT_SITE_BASE ||
      host.endsWith('.' + DEFAULT_SITE_BASE) ||
      host === base ||
      host.endsWith('.' + base) ||
      host === target ||
      host.endsWith('.workers.dev')
    )
      throw new DomainError(400, 'domain_reserved')
    const mapping = await stmt(
      'SELECT site_id FROM platform_domains WHERE hostname=?',
      host,
    ).first<{ site_id: number }>()
    if (mapping && mapping.site_id !== siteId)
      throw new DomainError(409, 'domain_conflict')
    const existing = await stmt(
      'SELECT * FROM platform_custom_domains WHERE hostname=?',
      host,
    ).first<Row>()
    if (existing && existing.state !== 'deleted') {
      if (existing.site_id !== siteId)
        throw new DomainError(409, 'domain_conflict')
      return domainDTO(existing, target)
    }
    if (existing && (existing.provider_id || existing.route_id))
      throw new DomainError(409, 'domain_cleanup_pending')
    const workspace = await stmt(
      'SELECT workspace_id FROM platform_sites WHERE id=?',
      siteId,
    ).first<{ workspace_id: number }>()
    const plan = await workspaceEntitlements(db, workspace!.workspace_id)
    if (!plan.limits.customDomains) throw new DomainError(403, 'domain_limit')
    const generation = dependencies.id(),
      time = now()
    try {
      const insertion = stmt(
        `INSERT INTO platform_custom_domains(hostname,site_id,generation,created_at,expires_at,next_check_at,dns_status)
      SELECT ?,?,?,?,?,?,? WHERE ${memberGuard}
      AND (SELECT COUNT(*) FROM platform_custom_domains WHERE state NOT IN('deleted','paused') AND NOT ${HAS_PROVIDER})<?
      AND (SELECT COUNT(*) FROM platform_custom_domains WHERE state<>'deleted' AND (state<>'paused' OR ${HAS_PROVIDER}))<?
      AND (SELECT COUNT(*) FROM platform_custom_domains c JOIN platform_sites s ON s.id=c.site_id WHERE s.workspace_id=(SELECT workspace_id FROM platform_sites WHERE id=?) AND c.state<>'deleted')<?
      ON CONFLICT(hostname) DO UPDATE SET site_id=excluded.site_id,generation=excluded.generation,revision=platform_custom_domains.revision+1,state='pending',created_at=excluded.created_at,expires_at=excluded.expires_at,next_check_at=excluded.next_check_at,dns_status=excluded.dns_status,provider_attempted=0,route_attempted=0,retry_requested=0,attempts=0,checked_at=NULL,verified_at=NULL,hostname_status='unknown',ssl_status='unknown',error=NULL,is_primary=0,redirects=0,lease_token=NULL,lease_until=NULL,user_paused=0,hold_reason=NULL,purge_requested=0,restore_primary=0
      WHERE platform_custom_domains.state='deleted' AND platform_custom_domains.provider_id IS NULL AND platform_custom_domains.route_id IS NULL`,
        host,
        siteId,
        generation,
        time,
        time + CLAIM_TTL,
        time,
        'missing',
        siteId,
        userId,
        PENDING_LIMIT,
        resourceLimit + PENDING_LIMIT,
        siteId,
        plan.limits.customDomains,
      )
      await db.batch([
        insertion,
        audit(
          siteId,
          host,
          generation,
          'requested',
          userId,
          'hostname=? AND generation=?',
          [host, generation],
        ),
      ])
      const result = await stmt(
        'SELECT * FROM platform_custom_domains WHERE hostname=? AND generation=?',
        host,
        generation,
      ).first<Row>()
      if (!result) {
        const concurrent = await stmt(
          'SELECT * FROM platform_custom_domains WHERE hostname=?',
          host,
        ).first<Row>()
        if (
          concurrent &&
          concurrent.site_id === siteId &&
          concurrent.state !== 'deleted'
        )
          return domainDTO(concurrent, target)
        if (concurrent) throw new DomainError(409, 'domain_conflict')
        throw new DomainError(429, 'domain_limit')
      }
      return domainDTO(result, target)
    } catch (error) {
      if (String(error).includes('UNIQUE constraint'))
        throw new DomainError(409, 'domain_conflict')
      throw error
    }
  }
  async function mutate(
    userId: number,
    siteId: number,
    host: string,
    generation: string,
    revision: number,
    action: 'pause' | 'resume' | 'delete' | 'check' | 'primary' | 'redirects',
    value = false,
  ) {
    await authorize(userId, siteId)
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new DomainError(400, 'domain_invalid')
    const row = await stmt(
      'SELECT * FROM platform_custom_domains WHERE hostname=? AND site_id=? AND generation=?',
      host,
      siteId,
      generation,
    ).first<Row>()
    if (!row || row.state === 'deleted')
      throw new DomainError(404, 'domain_not_found')
    if (row.revision !== revision) throw new DomainError(409, 'domain_changed')
    if (
      (action === 'primary' || action === 'redirects') &&
      (row.state !== 'active' ||
        !row.verified_at ||
        row.verified_at < now() - DOMAIN_HEALTH_TTL)
    )
      throw new DomainError(409, 'domain_not_ready')
    if (row.state === 'deleting' && action !== 'delete')
      throw new DomainError(409, 'domain_cleanup_pending')
    if (
      ['resume', 'primary', 'redirects'].includes(action) &&
      !(await domainEligibility(db, host)).allowed
    )
      throw new DomainError(403, 'domain_limit')
    if (action === 'resume' && row.state !== 'paused')
      throw new DomainError(409, 'domain_changed')
    if (action === 'check' && row.next_check_at > now() + 30000)
      throw new DomainError(429, 'domain_wait')
    const guard = `hostname=? AND site_id=? AND generation=? AND revision=? AND ${memberGuard}${action === 'primary' || action === 'redirects' ? ` AND state='active' AND verified_at>=${now() - DOMAIN_HEALTH_TTL}` : ''}`
    const args = [host, siteId, generation, revision, siteId, userId]
    const statements: D1Statement[] = [
      audit(siteId, host, generation, action, userId, guard, args),
    ]
    if (action === 'primary')
      statements.push(
        stmt(
          `UPDATE platform_custom_domains SET is_primary=0,restore_primary=0 WHERE site_id=? AND hostname<>? AND EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard})`,
          siteId,
          host,
          ...args,
        ),
      )
    let set =
      action === 'pause'
        ? "state='paused',is_primary=0,user_paused=1,hold_reason='manual',restore_primary=0"
        : action === 'delete'
          ? "state='deleting',is_primary=0,restore_primary=0"
          : action === 'resume'
            ? "state='pending',is_primary=0,user_paused=0,hold_reason=NULL"
            : action === 'primary'
              ? 'is_primary=1,restore_primary=0'
              : action === 'redirects'
                ? `redirects=${value ? 1 : 0}`
                : 'error=NULL,retry_requested=1'
    if (action === 'pause' || action === 'delete' || action === 'resume')
      statements.push(
        stmt(
          `UPDATE platform_domains SET active=0 WHERE hostname=? AND site_id=? AND EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard})`,
          host,
          siteId,
          ...args,
        ),
      )
    statements.push(
      stmt(
        `UPDATE platform_custom_domains SET ${set},revision=revision+1,next_check_at=? WHERE ${guard}`,
        now(),
        ...args,
      ),
    )
    const results = await db.batch(statements)
    if (results.at(-1)?.meta.changes !== 1)
      throw new DomainError(409, 'domain_changed')
    return { ok: true }
  }
  /** Claim only a bounded due batch; API checks and scheduled checks share the lease. */
  async function reconcile(onlyHost?: string, batchSize = 5) {
    if (!config.enabled) return { checked: 0 }
    const rows = await stmt(
      `SELECT json_group_array(hostname) AS items FROM (SELECT hostname FROM platform_custom_domains WHERE (state IN ('pending','active','deleting','expired') OR (state='deleted' AND purge_requested=1) OR (state='paused' AND ((hold_reason IS NOT NULL AND hold_reason<>'manual') OR provider_attempted=1 OR route_attempted=1 OR (verified_at IS NULL AND expires_at<=?)))) AND next_check_at<=? AND (lease_until IS NULL OR lease_until<?) ${onlyHost ? 'AND hostname=?' : ''} ORDER BY CASE WHEN ${HAS_PROVIDER} THEN 0 WHEN next_check_at=0 THEN 1 WHEN state='pending' THEN 2 ELSE 3 END,next_check_at,hostname LIMIT ?)`,
      now(),
      now(),
      now(),
      ...(onlyHost ? [onlyHost] : []),
      Math.max(1, Math.min(5, Math.floor(batchSize))),
    ).first<{ items: string }>()
    let checked = 0
    for (const host of JSON.parse(rows?.items ?? '[]') as string[]) {
      const token = dependencies.id(),
        time = now()
      const row = await stmt(
        `UPDATE platform_custom_domains SET lease_token=?,lease_until=? WHERE hostname=? AND (lease_until IS NULL OR lease_until<?) AND next_check_at<=? AND (state IN ('pending','active','deleting','expired') OR (state='deleted' AND purge_requested=1) OR (state='paused' AND ((hold_reason IS NOT NULL AND hold_reason<>'manual') OR provider_attempted=1 OR route_attempted=1 OR (verified_at IS NULL AND expires_at<=?)))) RETURNING *`,
        token,
        time + 300000,
        host,
        time,
        time,
        time,
      ).first<Row>()
      if (!row) continue
      const epoch = await stmt(
        'SELECT revision FROM platform_policy_epoch WHERE id=1',
      ).first<{ revision: number }>()
      const guard =
        'hostname=? AND generation=? AND lease_token=? AND revision=? AND state=? AND (SELECT revision FROM platform_policy_epoch WHERE id=1)=?'
      const args = [
        host,
        row.generation,
        token,
        row.revision,
        row.state,
        epoch!.revision,
      ]
      const fenced = async (
        sql: string,
        ...values: (string | number | null)[]
      ) => {
        const result = await stmt(
          `UPDATE platform_custom_domains SET ${sql} WHERE ${guard}`,
          ...values,
          ...args,
        ).run()
        if (result.meta.changes !== 1)
          throw new DomainError(409, 'domain_changed')
      }
      const complete = async (statements: D1Statement[], action?: string) => {
        const results = await db.batch([
          ...(action
            ? [
                audit(
                  row.site_id,
                  host,
                  row.generation,
                  action,
                  null,
                  guard,
                  args,
                ),
              ]
            : []),
          ...statements,
        ])
        if (results.at(-1)?.meta.changes !== 1)
          throw new DomainError(409, 'domain_changed')
      }
      try {
        const eligibility = await domainEligibility(db, host)
        const expired =
          (row.state === 'pending' || row.state === 'paused') &&
          time >= row.expires_at &&
          !row.verified_at
        const deleting =
          row.state === 'deleting' ||
          (row.state === 'deleted' && row.purge_requested === 1) ||
          row.state === 'expired' ||
          expired
        const hold = row.user_paused ? 'manual' : eligibility.reason
        if (deleting || hold) {
          if (
            !deleting &&
            row.state === 'paused' &&
            row.hold_reason === hold &&
            !row.provider_id &&
            !row.route_id &&
            !row.provider_attempted &&
            !row.route_attempted &&
            !row.is_primary
          ) {
            await fenced(
              'checked_at=?,next_check_at=?,lease_token=NULL,lease_until=NULL',
              time,
              time + 1800000,
            )
            checked++
            continue
          }
          // Delete only resources owned by this claim, recovering IDs after uncertain writes.
          let providerId = row.provider_id,
            routeId = row.route_id
          if (!providerId && row.provider_attempted)
            providerId = (await dependencies.provider.find(host))?.id ?? null
          if (!routeId && row.route_attempted) {
            const route = await dependencies.provider.findRoute(host)
            if (route && !route.owned)
              throw new DomainError(409, 'domain_provider_conflict')
            routeId = route?.id ?? null
          }
          if (routeId) await dependencies.provider.removeRoute(routeId, host)
          if (providerId) await dependencies.provider.remove(providerId)
          await complete(
            [
              stmt(
                `DELETE FROM platform_domains WHERE hostname=? AND site_id=? AND kind='custom' AND EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard})`,
                host,
                row.site_id,
                ...args,
              ),
              stmt(
                `UPDATE platform_custom_domains SET revision=revision+1,state=?,restore_primary=CASE WHEN ?=0 AND user_paused=0 THEN MAX(restore_primary,is_primary) ELSE 0 END,is_primary=0,provider_id=NULL,route_id=NULL,provider_attempted=0,route_attempted=0,hold_reason=?,hostname_status='removed',ssl_status='removed',error=NULL,checked_at=?,next_check_at=?,lease_token=NULL,lease_until=NULL WHERE ${guard}`,
                deleting ? 'deleted' : 'paused',
                deleting ? 1 : 0,
                deleting ? null : hold,
                time,
                deleting && row.purge_requested
                  ? time
                  : time + (deleting ? 86400000 : 1800000),
                ...args,
              ),
            ],
            deleting ? 'removed' : 'suspended',
          )
          if (deleting && row.purge_requested)
            await stmt(
              "DELETE FROM platform_custom_domains WHERE hostname=? AND generation=? AND state='deleted' AND provider_id IS NULL AND route_id IS NULL AND provider_attempted=0 AND route_attempted=0",
              host,
              row.generation,
            ).run()
          checked++
          continue
        }
        if (row.state === 'deleted') continue
        const dns = await dependencies.dns(
          host,
          domainClaimTarget(row.generation, target),
        )
        if (dns === 'unknown')
          throw new DomainError(503, 'domain_dns_unavailable')
        if (dns === 'missing') {
          await complete([
            stmt(
              `UPDATE platform_domains SET active=0 WHERE hostname=? AND site_id=? AND EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard})`,
              host,
              row.site_id,
              ...args,
            ),
            stmt(
              `UPDATE platform_custom_domains SET revision=revision+1,state='pending',is_primary=0,dns_status=?,checked_at=?,next_check_at=?,error=NULL,lease_token=NULL,lease_until=NULL WHERE ${guard}`,
              'missing',
              time,
              time + 30000,
              ...args,
            ),
          ])
          checked++
          continue
        }
        let provider = row.provider_id
          ? await dependencies.provider.get(row.provider_id)
          : await dependencies.provider.find(host)
        if (!row.provider_id && provider && !row.provider_attempted)
          throw new DomainError(409, 'domain_provider_conflict')
        if (row.provider_id && !provider) {
          if (row.route_id)
            await dependencies.provider.removeRoute(row.route_id, host)
          await fenced('provider_id=NULL,route_id=NULL,route_attempted=0')
          row.route_id = null
          row.route_attempted = 0
          row.provider_id = null
        }
        if (!provider) {
          const allocationToken = dependencies.id()
          const allocation = await stmt(
            'UPDATE platform_domain_provider_lock SET lease_token=?,lease_until=? WHERE id=1 AND (lease_until IS NULL OR lease_until<?)',
            allocationToken,
            now() + 300000,
            now(),
          ).run()
          if (allocation.meta.changes !== 1)
            throw new DomainError(429, 'domain_wait')
          try {
            const reserved = await stmt(
              `SELECT COUNT(*) AS n FROM platform_custom_domains WHERE state<>'deleted' AND hostname<>? AND ${HAS_PROVIDER}`,
              host,
            ).first<{ n: number }>()
            if (
              (reserved?.n ?? resourceLimit) >= resourceLimit ||
              (await dependencies.provider.count()) >= resourceLimit
            )
              throw new DomainError(429, 'domain_limit')
            await fenced('provider_attempted=1')
            provider = await dependencies.provider.create(host)
          } finally {
            await stmt(
              'UPDATE platform_domain_provider_lock SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?',
              allocationToken,
            ).run()
          }
        }
        if (row.retry_requested && row.provider_id) {
          await dependencies.provider.retry(row.provider_id)
          provider = await dependencies.provider.get(row.provider_id)
          if (!provider) throw new DomainError(409, 'domain_provider_missing')
          await fenced('retry_requested=0')
        }
        await fenced(
          "provider_id=?,hostname_status=?,ssl_status=?,dns_status='ready'",
          provider.id,
          provider.status,
          provider.ssl,
        )
        let routeId = row.route_id
        if (
          provider.status === 'active' &&
          provider.ssl === 'active' &&
          config.routingReady
        ) {
          const route = await dependencies.provider.findRoute(host)
          if (route && !route.owned)
            throw new DomainError(409, 'domain_provider_conflict')
          if (!routeId && route && !row.route_attempted)
            throw new DomainError(409, 'domain_provider_conflict')
          if (routeId && (!route || route.id !== routeId))
            throw new DomainError(409, 'domain_provider_missing')
          if (!routeId) {
            await fenced('route_attempted=1')
            routeId =
              route?.id ?? (await dependencies.provider.createRoute(host))
          }
          await fenced('route_id=?', routeId)
        }
        const active =
          provider.status === 'active' &&
          provider.ssl === 'active' &&
          !!routeId &&
          config.routingReady
        await complete(
          [
            stmt(
              `INSERT INTO platform_domains(hostname,site_id,verified,active,kind) SELECT ?,?,1,?,'custom' WHERE EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard}) ON CONFLICT(hostname) DO UPDATE SET active=excluded.active,verified=1,kind='custom' WHERE platform_domains.site_id=excluded.site_id`,
              host,
              row.site_id,
              active ? 1 : 0,
              ...args,
            ),
            stmt(
              `UPDATE platform_custom_domains SET revision=revision+1,state=?,is_primary=CASE WHEN ?=1 THEN CASE WHEN restore_primary=1 AND NOT EXISTS(SELECT 1 FROM platform_custom_domains other WHERE other.site_id=platform_custom_domains.site_id AND other.hostname<>platform_custom_domains.hostname AND other.is_primary=1) THEN 1 ELSE is_primary END ELSE 0 END,hold_reason=NULL,error=?,attempts=CASE WHEN state='active' THEN 0 ELSE attempts+1 END,checked_at=?,verified_at=CASE WHEN ?=1 THEN ? ELSE verified_at END,next_check_at=?,lease_token=NULL,lease_until=NULL WHERE ${guard}`,
              active ? 'active' : 'pending',
              active ? 1 : 0,
              config.routingReady ? null : 'domain_routing_unavailable',
              time,
              active ? 1 : 0,
              time,
              time +
                (active
                  ? 1800000
                  : Math.min(1800000, 60000 * 2 ** Math.min(row.attempts, 5))),
              ...args,
            ),
          ],
          active !== (row.state === 'active')
            ? active
              ? 'activated'
              : 'pending'
            : undefined,
        )
        checked++
      } catch (error) {
        const code =
          error instanceof DomainError
            ? error.code
            : 'domain_provider_unavailable'
        const terminal =
          code === 'domain_provider_conflict' ||
          code === 'domain_provider_missing'
        await db.batch([
          stmt(
            `UPDATE platform_domains SET active=0 WHERE hostname=? AND EXISTS(SELECT 1 FROM platform_custom_domains WHERE ${guard} AND (?=1 OR verified_at IS NULL OR verified_at<?))`,
            host,
            ...args,
            terminal ? 1 : 0,
            time - DOMAIN_HEALTH_TTL,
          ),
          stmt(
            `UPDATE platform_custom_domains SET revision=revision+1,state=CASE WHEN state IN ('deleting','expired','paused') THEN state WHEN ?=1 OR verified_at IS NULL OR verified_at<? THEN 'pending' ELSE state END,is_primary=CASE WHEN ?=1 OR verified_at IS NULL OR verified_at<? THEN 0 ELSE is_primary END,error=?,attempts=attempts+1,checked_at=?,next_check_at=?,lease_token=NULL,lease_until=NULL WHERE ${guard}`,
            terminal ? 1 : 0,
            time - DOMAIN_HEALTH_TTL,
            terminal ? 1 : 0,
            time - DOMAIN_HEALTH_TTL,
            code,
            time,
            time + Math.min(1800000, 30000 * 2 ** Math.min(row.attempts, 6)),
            ...args,
          ),
        ])
      }
    }
    return { checked }
  }
  async function defaultPrimary(userId: number, siteId: number) {
    const site = await authorize(userId, siteId)
    await db.batch([
      stmt(
        `UPDATE platform_custom_domains SET is_primary=0,restore_primary=0,redirects=0,revision=revision+1 WHERE site_id=? AND ${memberGuard}`,
        siteId,
        siteId,
        userId,
      ),
      stmt(
        `INSERT INTO platform_domain_audit(site_id,hostname,generation,action,user_id,created_at) SELECT ?,?,?,'default-primary',?,? WHERE ${memberGuard}`,
        siteId,
        validSiteSlug(site.slug) ? defaultSiteHost(site.slug, base) : base,
        'default-' + site.revision,
        userId,
        now(),
        siteId,
        userId,
      ),
    ])
    return { ok: true }
  }
  return { list, request, mutate, reconcile, authorize, defaultPrimary }
}

/** Atomically reserve a new default address and keep the previous address as a temporary alias. */
export async function renameDefaultDomain(
  db: PlatformD1,
  userId: number,
  siteId: number,
  input: { slug: unknown; revision: unknown },
  base = DEFAULT_SITE_BASE,
  now = Date.now(),
) {
  if (!validSiteSlug(input.slug) || !Number.isSafeInteger(input.revision))
    throw new DomainError(400, 'domain_invalid')
  const current = await db
    .prepare(
      `SELECT s.slug,s.revision FROM platform_sites s JOIN platform_memberships m ON m.workspace_id=s.workspace_id WHERE s.id=? AND s.suspended=0 AND m.user_id=? AND m.role='admin'`,
    )
    .bind(siteId, userId)
    .first<{ slug: string; revision: number }>()
  if (!current) throw new DomainError(403, 'domain_admin_required')
  if (current.revision !== input.revision)
    throw new DomainError(409, 'domain_changed')
  if (current.slug === input.slug) return { ok: true }
  const host = defaultSiteHost(input.slug, base),
    guard =
      "EXISTS(SELECT 1 FROM platform_sites s JOIN platform_memberships m ON m.workspace_id=s.workspace_id WHERE s.id=? AND s.suspended=0 AND s.revision=? AND m.user_id=? AND m.role='admin')",
    args = [siteId, current.revision, userId]
  try {
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO platform_site_slugs(slug,site_id) SELECT ?,? WHERE ${guard} ON CONFLICT(slug) DO UPDATE SET site_id=CASE WHEN platform_site_slugs.site_id=excluded.site_id THEN platform_site_slugs.site_id ELSE NULL END`,
        )
        .bind(input.slug, siteId, ...args),
      db
        .prepare(
          `INSERT INTO platform_domains(hostname,site_id,verified,active,kind) SELECT ?,?,1,1,'default' WHERE ${guard} ON CONFLICT(hostname) DO UPDATE SET site_id=CASE WHEN platform_domains.site_id=excluded.site_id THEN platform_domains.site_id ELSE NULL END,active=1,redirect_to=NULL,redirect_until=NULL,kind='default'`,
        )
        .bind(host, siteId, ...args),
      db
        .prepare(
          `UPDATE platform_domains SET kind='alias',redirect_to=?,redirect_until=? WHERE site_id=? AND hostname<>? AND kind IN ('default','legacy','alias') AND ${guard}`,
        )
        .bind(host, now + 7 * 86400000, siteId, host, ...args),
      db
        .prepare(
          `INSERT INTO platform_domain_audit(site_id,hostname,generation,action,user_id,created_at) SELECT ?,?,?,'rename',?,? WHERE ${guard}`,
        )
        .bind(
          siteId,
          host,
          'default-' + current.revision,
          userId,
          now,
          ...args,
        ),
      db
        .prepare(
          `UPDATE platform_sites SET slug=?,revision=revision+1 WHERE id=? AND revision=? AND platform_sites.suspended=0 AND EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id=platform_sites.workspace_id AND user_id=? AND role='admin')`,
        )
        .bind(input.slug, ...args),
    ])
    if (results[4]?.meta.changes !== 1)
      throw new DomainError(409, 'domain_changed')
    return { ok: true }
  } catch (error) {
    if (/UNIQUE constraint|NOT NULL constraint/.test(String(error)))
      throw new DomainError(409, 'domain_conflict')
    throw error
  }
}
