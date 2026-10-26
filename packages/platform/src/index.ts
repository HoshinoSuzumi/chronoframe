import { domainEligibility } from './domain-policy.ts'
import { DOMAIN_HEALTH_TTL } from './domains.ts'
import type { EmailCodeStore } from '@chronoframe/core'
import type { PlatformDirectory, PlatformSession } from '@chronoframe/core'

/** Structural subset implemented by a Cloudflare D1 binding; no native runtime dependency. */
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement
  first<T>(): Promise<T | null>
  run(): Promise<{ meta: { changes: number } }>
}
export interface PlatformD1 {
  prepare(sql: string): D1Statement
  batch(statements: D1Statement[]): Promise<{ meta: { changes: number } }[]>
}
export function createD1Directory(
  db: PlatformD1,
  now = Date.now,
): PlatformDirectory {
  return {
    async getSite(id) {
      const row = await db
        .prepare(
          'SELECT id, workspace_id AS workspaceId, published FROM platform_sites WHERE id = ? AND suspended=0',
        )
        .bind(id)
        .first<{ id: number; workspaceId: number; published: number }>()
      return row ? { ...row, published: row.published === 1 } : null
    },
    async getMembership(userId, workspaceId) {
      return db
        .prepare(
          'SELECT user_id AS userId, workspace_id AS workspaceId, role FROM platform_memberships WHERE user_id = ? AND workspace_id = ?',
        )
        .bind(userId, workspaceId)
        .first()
    },
    async getPublishedSiteByHost(host) {
      const row = await db
        .prepare(
          `SELECT s.id, s.workspace_id AS workspaceId, s.published, d.kind FROM platform_domains d JOIN platform_sites s ON s.id=d.site_id LEFT JOIN platform_custom_domains cd ON cd.hostname=d.hostname WHERE d.hostname=? AND d.verified=1 AND d.active=1 AND s.published=1 AND s.suspended=0 AND NOT EXISTS(SELECT 1 FROM platform_workspaces w JOIN platform_account_controls ac ON ac.user_id=w.owner_user_id WHERE w.id=s.workspace_id AND ac.suspended=1) AND (d.kind<>'custom' OR (cd.site_id=d.site_id AND cd.state='active' AND cd.verified_at>=?)) AND (d.kind<>'alias' OR d.redirect_until>?)`,
        )
        .bind(host, now() - DOMAIN_HEALTH_TTL, now())
        .first<{
          id: number
          workspaceId: number
          published: number
          kind: string
        }>()
      if (
        !row ||
        (row.kind === 'custom' && !(await domainEligibility(db, host)).allowed)
      )
        return null
      const { kind: _kind, ...site } = row
      return { ...site, published: row.published === 1 }
    },
  }
}
export function createD1EmailCodeStore(db: PlatformD1): EmailCodeStore {
  return {
    async reserve(record, policy) {
      // An INSERT ... SELECT makes rate checks and insertion one write operation.
      // D1 batch is transactional: replace the prior code only if insertion succeeded.
      const results = await db.batch([
        db
          .prepare(`INSERT INTO platform_email_codes (id, email_key, client_key, code_mac, created_at, expires_at)
          SELECT ?, ?, ?, ?, ?, ? WHERE
          NOT EXISTS (SELECT 1 FROM platform_email_codes WHERE email_key = ? AND created_at > ?)
          AND (SELECT COUNT(*) FROM platform_email_codes WHERE email_key = ? AND created_at > ?) < ?
          AND (SELECT COUNT(*) FROM platform_email_codes WHERE client_key = ? AND created_at > ?) < ?`)
          .bind(
            record.id,
            record.emailKey,
            record.clientKey,
            record.codeMac,
            record.createdAt,
            record.expiresAt,
            record.emailKey,
            record.createdAt - policy.resendAfterMs,
            record.emailKey,
            record.createdAt - policy.windowMs,
            policy.maxEmailRequests,
            record.clientKey,
            record.createdAt - policy.windowMs,
            policy.maxClientRequests,
          ),
        db
          .prepare(
            'UPDATE platform_email_codes SET active = 0 WHERE email_key = ? AND id <> ? AND EXISTS (SELECT 1 FROM platform_email_codes WHERE id = ?)',
          )
          .bind(record.emailKey, record.id, record.id),
      ])
      return results[0]?.meta.changes === 1
    },
    async discard(id) {
      // Retain the rate-limit ledger even when delivery fails.
      await db
        .prepare('UPDATE platform_email_codes SET active = 0 WHERE id = ?')
        .bind(id)
        .run()
    },
    async consume(input) {
      const row = await db
        .prepare(`UPDATE platform_email_codes SET attempts = attempts + 1,
        consumed = CASE WHEN code_mac = ? THEN 1 ELSE 0 END
        WHERE id = ? AND email_key = ? AND active = 1 AND consumed = 0 AND expires_at > ? AND attempts < ?
        RETURNING consumed`)
        .bind(
          input.codeMac,
          input.id,
          input.emailKey,
          input.now,
          input.maxAttempts,
        )
        .first<{ consumed: number }>()
      return row?.consumed === 1
    },
  }
}
export function createD1Sessions(db: PlatformD1) {
  return {
    async create(
      verifiedEmail: string,
      tokenMac: string,
      now: number,
      expiresAt: number,
    ): Promise<void> {
      await db.batch([
        db
          .prepare(
            'INSERT INTO platform_users (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING',
          )
          .bind(verifiedEmail, now),
        db
          .prepare(
            'INSERT INTO platform_sessions (token_mac, user_id, expires_at) SELECT ?, id, ? FROM platform_users WHERE email = ?',
          )
          .bind(tokenMac, expiresAt, verifiedEmail),
      ])
    },
    async get(tokenMac: string, now: number): Promise<PlatformSession | null> {
      return db
        .prepare(
          'SELECT user_id AS userId, expires_at AS expiresAt FROM platform_sessions WHERE token_mac = ? AND expires_at > ?',
        )
        .bind(tokenMac, now)
        .first()
    },
    async revoke(tokenMac: string): Promise<void> {
      await db
        .prepare('DELETE FROM platform_sessions WHERE token_mac = ?')
        .bind(tokenMac)
        .run()
    },
  }
}

export interface PlatformSiteSummary {
  suspended: boolean
  suspensionReason: string
  siteId: number
  workspaceId: number
  name: string
  published: boolean
  role: 'admin' | 'member'
}
/** Read portal Site metadata through live Workspace Memberships; never infer a default Site. */
export function createD1SiteCatalog(db: PlatformD1) {
  return {
    /** Return this user's readable Sites, including their unpublished drafts. */
    async list(userId: number): Promise<PlatformSiteSummary[]> {
      // JSON aggregation avoids exposing driver-specific `all()` result types.
      const row = await db
        .prepare(`SELECT json_group_array(json_object(
        'siteId', id, 'workspaceId', workspace_id, 'name', name,
        'published', published, 'role', role,'suspended',suspended,'suspensionReason',suspension_reason)) AS items FROM (
        SELECT s.id, s.workspace_id, s.name, s.published, m.role,s.suspended,s.suspension_reason
        FROM platform_sites s JOIN platform_memberships m ON m.workspace_id = s.workspace_id
        WHERE m.user_id = ? AND m.role IN ('admin', 'member') ORDER BY s.id
      )`)
        .bind(userId)
        .first<{ items: string }>()
      return (
        JSON.parse(row?.items ?? '[]') as (Omit<
          PlatformSiteSummary,
          'published' | 'suspended'
        > & { published: number; suspended: number })[]
      ).map((site) => ({
        ...site,
        suspended: site.suspended === 1,
        published: site.published === 1,
      }))
    },
    /** Read a name after the caller has independently authorized or resolved the Site. */
    async name(siteId: number): Promise<string> {
      const row = await db
        .prepare('SELECT name FROM platform_sites WHERE id = ?')
        .bind(siteId)
        .first<{ name: string }>()
      return row?.name ?? 'ChronoFrame'
    },
  }
}

export {
  createD1Provisioning,
  siteIdentity,
  ProvisioningError,
} from './provisioning.ts'
export type { ManagedSite } from './provisioning.ts'
export { createStorageVault } from './storage-vault.ts'
export type { CloudStoragePublic, CloudStorageSecret } from './storage-vault.ts'
