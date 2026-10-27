import type { PlatformD1 } from './index.ts'
import { allRows } from './subscriptions.ts'
export interface AccountCleanup {
  billing?(userId: number): Promise<boolean>
  domains(siteId: number): Promise<boolean>
  storage(
    siteId: number,
    connectionId: string,
    revision: number,
  ): Promise<boolean>
}
/** External resources are acknowledged before deleting the credentials/catalog needed to retry. */
export async function purgeAccounts(
  db: PlatformD1,
  cleanup: AccountCleanup,
  now = Date.now(),
) {
  const row = await db
    .prepare(
      'SELECT * FROM platform_account_deletions WHERE purge_at<=? AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY next_attempt_at,purge_at,user_id LIMIT 1',
    )
    .bind(now, now, now)
    .first<any>()
  if (!row) return
  const token = crypto.randomUUID(),
    lock = await db
      .prepare(
        "UPDATE platform_account_deletions SET state='purging',revision=revision+1,lease_token=?,lease_until=? WHERE user_id=? AND purge_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING user_id",
      )
      .bind(token, now + 300000, row.user_id, now, now)
      .first()
  if (!lock) return
  const id = row.user_id
  try {
    const billing = await db
      .prepare(
        "SELECT s.id FROM platform_payment_subscriptions s JOIN platform_workspaces w ON w.id=s.workspace_id JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE (w.owner_user_id=? OR c.user_id=?) AND s.status NOT IN('canceled','expired') UNION ALL SELECT c.id FROM platform_payment_checkouts c JOIN platform_workspaces w ON w.id=c.workspace_id WHERE (w.owner_user_id=? OR c.user_id=?) AND c.state IN('creating','open','uncertain') LIMIT 1",
      )
      .bind(id, id, id, id)
      .first()
    if (billing && (!cleanup.billing || !(await cleanup.billing(id))))
      throw new Error('Payment cancellation required')
    // A purging account cannot be restored; all existing leases are fenced before external cleanup.
    await db
      .prepare(
        "UPDATE cloud_processing_jobs SET state='cancelled',lease_until=NULL,attempt_id=NULL WHERE site_id IN(SELECT s.id FROM platform_sites s JOIN platform_workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=?) AND state IN('queued','running','retry_wait')",
      )
      .bind(id)
      .run()
    const sites = await allRows<{ id: number }>(
      db
        .prepare(
          'SELECT s.id FROM platform_sites s JOIN platform_workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=? ORDER BY s.id',
        )
        .bind(id),
    )
    let pending = false
    for (const site of sites) {
      if (!(await cleanup.domains(site.id))) {
        pending = true
        break
      }
      const connection = await db
        .prepare(
          'SELECT v.connection_id,v.revision FROM cloud_storage_versions v WHERE v.site_id=? AND NOT EXISTS(SELECT 1 FROM platform_purge_storage_done d WHERE d.user_id=? AND d.site_id=v.site_id AND d.connection_id=v.connection_id AND d.revision=v.revision) ORDER BY v.connection_id,v.revision LIMIT 1',
        )
        .bind(site.id, id)
        .first<{ connection_id: string; revision: number }>()
      if (connection) {
        if (
          await cleanup.storage(
            site.id,
            connection.connection_id,
            connection.revision,
          )
        )
          await db
            .prepare(
              'INSERT OR IGNORE INTO platform_purge_storage_done VALUES(?,?,?,?)',
            )
            .bind(id, site.id, connection.connection_id, connection.revision)
            .run()
        pending = true
        break
      }
    }
    if (pending) {
      await db
        .prepare(
          'UPDATE platform_account_deletions SET lease_token=NULL,lease_until=NULL,next_attempt_at=?,error=NULL WHERE user_id=? AND lease_token=?',
        )
        .bind(now + 1000, id, token)
        .run()
      return
    }
    // Build a child-first deletion order from the actual installed schema, including future site tables.
    const tables = await allRows<{ name: string }>(
      db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'platform_*' OR name GLOB 'cloud_*')",
      ),
    )
    const names = new Set(tables.map((t) => t.name)),
      siteTables: string[] = [],
      deps = new Map<string, string[]>()
    for (const { name } of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(name)) continue
      const cols = await allRows<{ name: string }>(
        db.prepare(`PRAGMA table_info("${name}")`),
      )
      if (cols.some((c) => c.name === 'site_id')) {
        siteTables.push(name)
        deps.set(
          name,
          (
            await allRows<{ table: string }>(
              db.prepare(`PRAGMA foreign_key_list("${name}")`),
            )
          )
            .map((f) => f.table)
            .filter((t) => t !== name),
        )
      }
    }
    const remaining = new Set(siteTables),
      order: string[] = []
    while (remaining.size) {
      const child = [...remaining].find(
        (t) =>
          ![...remaining].some(
            (other) => other !== t && deps.get(other)?.includes(t),
          ),
      )
      if (!child) throw new Error('Cleanup schema dependency cycle')
      order.push(child)
      remaining.delete(child)
    }
    const owned =
        'SELECT s.id FROM platform_sites s JOIN platform_workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=?',
      workspaces = 'SELECT id FROM platform_workspaces WHERE owner_user_id=?'
    const statements = order.map((t) =>
      db.prepare(`DELETE FROM "${t}" WHERE site_id IN(${owned})`).bind(id),
    )
    statements.push(
      db
        .prepare(
          `DELETE FROM platform_sites WHERE workspace_id IN(${workspaces})`,
        )
        .bind(id),
    )
    // Remove memberships in others' spaces without deleting those spaces or their files.
    statements.push(
      db
        .prepare(
          'UPDATE cloud_uploads SET owner_id=COALESCE((SELECT w.owner_user_id FROM platform_sites s JOIN platform_workspaces w ON w.id=s.workspace_id WHERE s.id=cloud_uploads.site_id),(SELECT MIN(user_id) FROM platform_memberships WHERE workspace_id=(SELECT workspace_id FROM platform_sites WHERE id=cloud_uploads.site_id) AND user_id<>?)) WHERE owner_id=?',
        )
        .bind(id, id),
    )
    statements.push(
      db
        .prepare(
          'DELETE FROM platform_activation_redemptions WHERE user_id=? OR workspace_id IN(' +
            workspaces +
            ') OR code_id IN(SELECT id FROM platform_activation_codes WHERE created_by=?)',
        )
        .bind(id, id, id),
    )
    statements.push(
      db
        .prepare('DELETE FROM platform_activation_codes WHERE created_by=?')
        .bind(id),
    )
    statements.push(
      db
        .prepare(
          'UPDATE platform_subscription_events SET actor_id=NULL WHERE actor_id=?',
        )
        .bind(id),
    )
    statements.push(
      db
        .prepare(
          `DELETE FROM platform_subscription_events WHERE workspace_id IN(${workspaces})`,
        )
        .bind(id),
    )
    statements.push(
      db
        .prepare(
          `DELETE FROM platform_workspace_plans WHERE workspace_id IN(${workspaces})`,
        )
        .bind(id),
    )
    statements.push(
      db
        .prepare(
          `DELETE FROM platform_memberships WHERE user_id=? OR workspace_id IN(${workspaces})`,
        )
        .bind(id, id),
    )
    // Callback bodies can contain the erased purchaser's personal data even on another owner's workspace.
    statements.push(
      db
        .prepare(
          'DELETE FROM platform_payment_event_payloads WHERE event_id IN(SELECT e.id FROM platform_payment_events e WHERE e.reference_id IN(SELECT id FROM platform_payment_checkouts WHERE user_id=?) OR e.object_id IN(SELECT provider_id FROM platform_payment_checkouts WHERE user_id=?) OR e.object_id IN(SELECT s.id FROM platform_payment_subscriptions s JOIN platform_payment_checkouts c ON c.id=s.checkout_id WHERE c.user_id=?))',
        )
        .bind(id, id, id),
    )
    // Payment resources were closed upstream. Retain other owners' ledgers without the erased purchaser identity.
    statements.push(
      db
        .prepare(
          `DELETE FROM platform_payment_events WHERE reference_id IN(SELECT id FROM platform_payment_checkouts WHERE workspace_id IN(${workspaces})) OR object_id IN(SELECT provider_id FROM platform_payment_checkouts WHERE workspace_id IN(${workspaces})) OR object_id IN(SELECT id FROM platform_payment_subscriptions WHERE workspace_id IN(${workspaces}))`,
        )
        .bind(id, id, id),
      db
        .prepare(
          `DELETE FROM platform_payment_subscriptions WHERE workspace_id IN(${workspaces})`,
        )
        .bind(id),
      db
        .prepare(
          `DELETE FROM platform_payment_checkouts WHERE workspace_id IN(${workspaces})`,
        )
        .bind(id),
      db
        .prepare(
          'UPDATE platform_payment_checkouts SET user_id=NULL WHERE user_id=?',
        )
        .bind(id),
      db
        .prepare(
          `DELETE FROM platform_payment_locks WHERE workspace_id IN(${workspaces})`,
        )
        .bind(id),
    )
    statements.push(
      db
        .prepare('DELETE FROM platform_workspaces WHERE owner_user_id=?')
        .bind(id),
    )
    for (const t of [
      'platform_admin_roles',
      'platform_sessions',
      'platform_accounts',
      'platform_passkeys',
      'platform_two_factors',
      'platform_auth_sessions',
      'platform_activation_attempts',
      'platform_payment_requests',
      'platform_account_controls',
      'platform_mail_outbox',
      'platform_purge_storage_done',
    ])
      if (names.has(t))
        statements.push(db.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(id))
    statements.push(
      db
        .prepare(
          "DELETE FROM platform_verifications WHERE identifier IN ('email-verification-otp-' || (SELECT email FROM platform_users WHERE id=?), 'sign-in-otp-' || (SELECT email FROM platform_users WHERE id=?), 'forget-password-otp-' || (SELECT email FROM platform_users WHERE id=?))",
        )
        .bind(id, id, id),
    )
    const factorKeys =
      "SELECT identifier FROM platform_verifications WHERE value=? AND identifier LIKE '2fa-%' AND identifier NOT LIKE '2fa-otp-%' AND identifier NOT LIKE '2fa-attempts-%'"
    statements.push(
      db
        .prepare(
          `DELETE FROM platform_verifications WHERE identifier IN(SELECT '2fa-attempts-'||identifier FROM (${factorKeys})) OR identifier IN(SELECT '2fa-otp-'||identifier FROM (${factorKeys}))`,
        )
        .bind(String(id), String(id)),
    )
    statements.push(
      db
        .prepare(
          "DELETE FROM platform_verifications WHERE value=? AND (identifier LIKE 'reset-password:%' OR identifier LIKE 'trust-device-%' OR (identifier LIKE '2fa-%' AND identifier NOT LIKE '2fa-otp-%' AND identifier NOT LIKE '2fa-attempts-%'))",
        )
        .bind(String(id)),
    )
    statements.push(
      db
        .prepare(
          "UPDATE platform_lifecycle_audit SET reason='Account erased',actor_id=CASE WHEN actor_id=? THEN NULL ELSE actor_id END WHERE user_id=? OR actor_id=?",
        )
        .bind(id, id, id),
    )
    if (names.has('platform_admin_audit'))
      statements.push(
        db
          .prepare(
            "UPDATE platform_admin_audit SET before_json=NULL,after_json=NULL,reason='Account erased' WHERE target=? AND action IN('user','account-mark','account-restore')",
          )
          .bind(String(id)),
      )
    // Keep a minimal event trail without deletion reasons or mail payloads.
    statements.push(
      db
        .prepare(
          "INSERT INTO platform_lifecycle_audit(id,user_id,action,reason,created_at) VALUES(?,?,'purge','Retention period elapsed; external cleanup confirmed',?)",
        )
        .bind(crypto.randomUUID(), id, now),
    )
    statements.push(
      db
        .prepare(
          'DELETE FROM platform_account_deletions WHERE user_id=? AND lease_token=?',
        )
        .bind(id, token),
    )
    statements.push(
      db
        .prepare(
          'DELETE FROM platform_users WHERE id=? AND NOT EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=?)',
        )
        .bind(id, id),
    )
    await db.batch(statements)
  } catch {
    await db
      .prepare(
        "UPDATE platform_account_deletions SET error='resource_cleanup_failed',next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE user_id=? AND lease_token=?",
      )
      .bind(now + 300000, id, token)
      .run()
  }
}
