import {
  accountExemption,
  validateExemptions,
  DEFAULT_EXEMPTIONS,
  type LifecycleExemptions,
} from './lifecycle-exemptions.ts'
import type { PlatformD1 } from './index.ts'
import { allRows } from './subscriptions.ts'
import { sendMail, type MailBinding, type MailKind } from './mail.ts'
export const DAY = 86400000
export type LifecycleSettings = {
  enabled: boolean
  unverifiedDays: number
  inactiveDays: number
  retentionDays: number
  warningDays: number[]
  exemptions?: LifecycleExemptions
}
export function validateLifecycleSettings(v: unknown): LifecycleSettings {
  const s = v as LifecycleSettings
  if (
    !s ||
    typeof s.enabled !== 'boolean' ||
    ![s.unverifiedDays, s.inactiveDays].every(
      (n) => Number.isSafeInteger(n) && n >= 1 && n <= 3650,
    ) ||
    !Number.isSafeInteger(s.retentionDays) ||
    s.retentionDays < 1 ||
    s.retentionDays > 3650 ||
    !Array.isArray(s.warningDays) ||
    s.warningDays.length < 1 ||
    s.warningDays.length > 5 ||
    !s.warningDays.every(
      (n) =>
        Number.isSafeInteger(n) &&
        n > 0 &&
        n < Math.min(s.unverifiedDays, s.inactiveDays),
    ) ||
    new Set(s.warningDays).size !== s.warningDays.length
  )
    throw new Error('Invalid lifecycle settings')
  return {
    ...s,
    warningDays: [...s.warningDays].sort((a, b) => b - a),
    exemptions: validateExemptions(s.exemptions ?? DEFAULT_EXEMPTIONS),
  }
}
export async function lifecycleSettings(db: PlatformD1) {
  const s = await db
    .prepare('SELECT * FROM platform_lifecycle_settings WHERE id=1')
    .first<any>()
  if (!s) throw new Error('Lifecycle configuration unavailable')
  return {
    ...validateLifecycleSettings({
      enabled: !!s.enabled,
      unverifiedDays: s.unverified_days,
      inactiveDays: s.inactive_days,
      retentionDays: s.retention_days,
      warningDays: JSON.parse(s.warning_days_json),
      exemptions: JSON.parse(s.exemptions_json),
    }),
    revision: s.revision as number,
    activatedAt: s.activated_at as number,
  }
}
export const timeValue = (value: number | string) =>
  typeof value === 'number' ? value : new Date(value).getTime()
export function deletionDeadline(
  user: any,
  s: Awaited<ReturnType<typeof lifecycleSettings>>,
) {
  const verified = !!user.email_verified,
    anchor = verified
      ? (user.last_login_at ?? timeValue(user.created_at))
      : timeValue(user.created_at)
  return Math.max(
    anchor + (verified ? s.inactiveDays : s.unverifiedDays) * DAY,
    s.activatedAt + Math.max(...s.warningDays) * DAY,
    user.lifecycle_grace_until ?? 0,
  )
}
export const automaticReason = (verified: boolean, days: number) =>
  verified
    ? `No sign-in has been recorded for ${days} days.`
    : `Your email address is still unverified ${days} days after registration.`
const date = (v: number) =>
  new Date(v).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
export async function markAccount(
  db: PlatformD1,
  userId: number,
  reason: string,
  source: string,
  actorId: number | null,
  now = Date.now(),
  expected?: {
    login: number | null
    verified: number
    settingsRevision: number
  },
) {
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    reason.trim().length < 3 ||
    reason.length > 500
  )
    throw new Error('Invalid deletion request')
  const s = await lifecycleSettings(db)
  const policyEpoch = await db
    .prepare('SELECT revision FROM platform_policy_epoch WHERE id=1')
    .first<{ revision: number }>()
  if (expected && (await accountExemption(db, userId, s.exemptions!, now)))
    return false
  const generation = crypto.randomUUID(),
    purgeAt = now + s.retentionDays * DAY
  const guard =
      'EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=? AND generation=?)',
    args = [userId, generation]
  const row = await db
    .prepare('SELECT email,name FROM platform_users WHERE id=?')
    .bind(userId)
    .first<{ email: string; name: string }>()
  if (!row) throw new Error('Account not found')
  await db.batch([
    db
      .prepare(
        `INSERT INTO platform_account_deletions(user_id,generation,source,reason,marked_at,purge_at,previous_suspended,previous_reason) SELECT u.id,?,?,?,?,?,COALESCE(c.suspended,0),COALESCE(c.public_reason,'') FROM platform_users u LEFT JOIN platform_account_controls c ON c.user_id=u.id WHERE u.id=? AND NOT EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=u.id) ${expected ? 'AND u.last_login_at IS ? AND u.email_verified=? AND EXISTS(SELECT 1 FROM platform_lifecycle_settings WHERE id=1 AND enabled=1 AND revision=?) AND EXISTS(SELECT 1 FROM platform_policy_epoch WHERE id=1 AND revision=?)' : ''}`,
      )
      .bind(
        generation,
        source,
        reason.trim(),
        now,
        purgeAt,
        userId,
        ...(expected
          ? [
              expected.login,
              expected.verified,
              expected.settingsRevision,
              policyEpoch!.revision,
            ]
          : []),
      ),
    db
      .prepare(
        `INSERT INTO platform_account_controls(user_id,suspended,public_reason) SELECT ?,1,? WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET suspended=1,public_reason=excluded.public_reason,revision=revision+1`,
      )
      .bind(
        userId,
        `Account deleted: ${reason.trim()} Contact support@chronoframe.art before ${date(purgeAt)} to request restoration.`,
        ...args,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO platform_deletion_sites(user_id,site_id,suspended,reason,revision) SELECT ?,s.id,s.suspended,s.suspension_reason,s.revision FROM platform_sites s JOIN platform_workspaces w ON w.id=s.workspace_id WHERE w.owner_user_id=? AND ${guard}`,
      )
      .bind(userId, userId, ...args),
    db
      .prepare(
        `UPDATE platform_sites SET suspended=1,suspension_reason='Owner account marked for deletion',revision=revision+1 WHERE id IN(SELECT site_id FROM platform_deletion_sites WHERE user_id=?) AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(
        `UPDATE cloud_processing_jobs SET lease_until=? WHERE state='running' AND site_id IN(SELECT site_id FROM platform_deletion_sites WHERE user_id=?) AND ${guard}`,
      )
      .bind(now, userId, ...args),
    db
      .prepare(
        `DELETE FROM platform_auth_sessions WHERE user_id=? AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(`DELETE FROM platform_sessions WHERE user_id=? AND ${guard}`)
      .bind(userId, ...args),
    db
      .prepare(
        `UPDATE platform_custom_domains SET next_check_at=0,revision=revision+1,lease_token=NULL,lease_until=NULL WHERE site_id IN(SELECT id FROM platform_sites WHERE workspace_id IN(SELECT id FROM platform_workspaces WHERE owner_user_id=?)) AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(
        `UPDATE platform_policy_epoch SET revision=revision+1 WHERE id=1 AND ${guard}`,
      )
      .bind(...args),
    db
      .prepare(
        `INSERT INTO platform_lifecycle_audit(id,user_id,actor_id,action,reason,created_at) SELECT ?,?,?,'mark',?,? WHERE ${guard}`,
      )
      .bind(generation, userId, actorId, reason.trim(), now, ...args),
    db
      .prepare(
        `INSERT OR IGNORE INTO platform_mail_outbox(id,user_id,kind,cycle,to_email,payload_json,available_at) SELECT ?,?,'account-deleted',?,?,?,? WHERE ${guard}`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        generation,
        row.email,
        JSON.stringify({
          reason: reason.trim(),
          purgeAt: date(purgeAt),
          retentionDays: String(s.retentionDays),
          name: row.name,
        }),
        now,
        ...args,
      ),
  ])
  return !!(await db
    .prepare(
      'SELECT user_id FROM platform_account_deletions WHERE user_id=? AND generation=?',
    )
    .bind(...args)
    .first())
}
export async function restoreAccount(
  db: PlatformD1,
  userId: number,
  revision: number,
  actorId: number,
  reason: string,
  now = Date.now(),
) {
  const s = await lifecycleSettings(db),
    id = crypto.randomUUID(),
    guard =
      "EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=? AND state='marked' AND purge_at>? AND revision=?)",
    args = [userId, now, revision]
  await db.batch([
    db
      .prepare(
        `INSERT INTO platform_lifecycle_audit(id,user_id,actor_id,action,reason,created_at) SELECT ?,?,?,'restore',?,? WHERE ${guard}`,
      )
      .bind(id, userId, actorId, reason, now, ...args),
    db
      .prepare(
        `UPDATE platform_account_controls SET suspended=(SELECT previous_suspended FROM platform_account_deletions WHERE user_id=?),public_reason=(SELECT previous_reason FROM platform_account_deletions WHERE user_id=?),revision=revision+1 WHERE user_id=? AND ${guard}`,
      )
      .bind(userId, userId, userId, ...args),
    db
      .prepare(
        `UPDATE platform_users SET last_login_at=?,lifecycle_grace_until=? WHERE id=? AND ${guard}`,
      )
      .bind(now, now + s.unverifiedDays * DAY, userId, ...args),
    db
      .prepare(
        `UPDATE platform_mail_outbox SET state='cancelled' WHERE user_id=? AND state='pending' AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(
        `UPDATE platform_custom_domains SET next_check_at=0,revision=revision+1,lease_token=NULL,lease_until=NULL WHERE site_id IN(SELECT id FROM platform_sites WHERE workspace_id IN(SELECT id FROM platform_workspaces WHERE owner_user_id=?)) AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(
        `UPDATE platform_policy_epoch SET revision=revision+1 WHERE id=1 AND ${guard}`,
      )
      .bind(...args),
    db
      .prepare(
        `UPDATE platform_sites SET suspended=(SELECT suspended FROM platform_deletion_sites d WHERE d.site_id=platform_sites.id),suspension_reason=(SELECT reason FROM platform_deletion_sites d WHERE d.site_id=platform_sites.id),revision=revision+1 WHERE id IN(SELECT site_id FROM platform_deletion_sites WHERE user_id=?) AND revision=(SELECT revision+1 FROM platform_deletion_sites WHERE site_id=platform_sites.id) AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(
        `DELETE FROM platform_deletion_sites WHERE user_id=? AND ${guard}`,
      )
      .bind(userId, ...args),
    db
      .prepare(
        `DELETE FROM platform_account_deletions WHERE ${guard} AND user_id=?`,
      )
      .bind(...args, userId),
  ])
  return !!(await db
    .prepare('SELECT id FROM platform_lifecycle_audit WHERE id=?')
    .bind(id)
    .first())
}
export async function lifecycleFailure(
  db: PlatformD1,
  scope: string,
  now: number,
  userId: number | null = null,
) {
  console.error('account-lifecycle stage failed', scope)
  try {
    await db
      .prepare(
        "INSERT INTO platform_lifecycle_errors(scope,user_id,error,updated_at) VALUES(?,?,'lifecycle_stage_failed',?) ON CONFLICT(scope) DO UPDATE SET error=excluded.error,updated_at=excluded.updated_at",
      )
      .bind(scope, userId, now)
      .run()
  } catch {
    /* A database outage must not prevent independent stages from running. */
  }
}
export async function lifecycleStages(
  db: PlatformD1,
  stages: Record<string, () => Promise<unknown>>,
  now = Date.now(),
) {
  for (const [scope, run] of Object.entries(stages)) {
    try {
      await run()
      await db
        .prepare('DELETE FROM platform_lifecycle_errors WHERE scope=?')
        .bind(scope)
        .run()
    } catch {
      await lifecycleFailure(db, scope, now)
    }
  }
}
export async function scanAccounts(
  db: PlatformD1,
  now = Date.now(),
  limit = 50,
) {
  const s = await lifecycleSettings(db)
  if (!s.enabled) return
  // Keyset cursor prevents a fixed first page from starving older or newer accounts.
  const state = await db
    .prepare('SELECT value FROM platform_lifecycle_cursor WHERE id=1')
    .first<{ value: number }>()
  const users = await allRows<any>(
    db
      .prepare(
        'SELECT * FROM platform_users WHERE id>? AND NOT EXISTS(SELECT 1 FROM platform_account_deletions WHERE user_id=platform_users.id) ORDER BY id LIMIT ?',
      )
      .bind(state?.value ?? 0, limit),
  )
  const scanUser = async (u: any) => {
    if (await accountExemption(db, u.id, s.exemptions!, now)) {
      await db
        .prepare('UPDATE platform_users SET lifecycle_was_exempt=1 WHERE id=?')
        .bind(u.id)
        .run()
      return
    }
    if (u.lifecycle_was_exempt) {
      u.lifecycle_grace_until = Math.max(
        u.lifecycle_grace_until,
        now + Math.max(...s.warningDays) * DAY,
      )
      await db
        .prepare(
          'UPDATE platform_users SET lifecycle_was_exempt=0,lifecycle_grace_until=MAX(lifecycle_grace_until,?) WHERE id=?',
        )
        .bind(u.lifecycle_grace_until, u.id)
        .run()
    }
    const deadline = deletionDeadline(u, s),
      reason = automaticReason(
        !!u.email_verified,
        u.email_verified ? s.inactiveDays : s.unverifiedDays,
      )
    if (deadline <= now) {
      await markAccount(
        db,
        u.id,
        reason,
        u.email_verified ? 'inactive' : 'unverified',
        null,
        now,
        {
          login: u.last_login_at,
          verified: u.email_verified,
          settingsRevision: s.revision,
        },
      )
      return
    }
    const warning = s.warningDays.find(
      (days, index) =>
        now >= deadline - days * DAY &&
        (index === s.warningDays.length - 1 ||
          now < deadline - s.warningDays[index + 1]! * DAY),
    )
    if (warning !== undefined)
      await db
        .prepare(
          "INSERT OR IGNORE INTO platform_mail_outbox(id,user_id,kind,cycle,to_email,payload_json,available_at) VALUES(?,?,'deletion-warning',?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          u.id,
          `${deadline}:${warning}`,
          u.email,
          JSON.stringify({
            deadline,
            reason,
            deletionAt: date(deadline),
            purgeAt: date(deadline + s.retentionDays * DAY),
            action: u.email_verified
              ? 'Sign in before the deletion date to keep your account.'
              : 'Verify your email address before the deletion date to keep your account.',
            name: u.name,
          }),
          now,
        )
        .run()
  }
  for (const u of users) {
    const scope = 'scan-user:' + u.id
    try {
      await scanUser(u)
      await db
        .prepare('DELETE FROM platform_lifecycle_errors WHERE scope=?')
        .bind(scope)
        .run()
    } catch {
      await lifecycleFailure(db, scope, now, u.id)
    }
  }
  await db
    .prepare('UPDATE platform_lifecycle_cursor SET value=? WHERE id=1')
    .bind(users.length === limit ? users.at(-1).id : 0)
    .run()
}
export async function deliverLifecycleMail(
  db: PlatformD1,
  email: MailBinding,
  portal: string,
  now = Date.now(),
) {
  const s = await lifecycleSettings(db)
  // A worker may die after claiming the final attempt; reclaiming must not send a fourth time.
  await db
    .prepare(
      "UPDATE platform_mail_outbox SET state='failed',error='email_delivery_exhausted',lease_token=NULL,lease_until=NULL WHERE state='pending' AND attempts>=3 AND (lease_until IS NULL OR lease_until<?)",
    )
    .bind(now)
    .run()
  const rows = await allRows<any>(
    db
      .prepare(
        "SELECT * FROM platform_mail_outbox WHERE state='pending' AND attempts<3 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY available_at,id LIMIT 10",
      )
      .bind(now, now),
  )
  for (const row of rows) {
    const token = crypto.randomUUID(),
      claimed = await db
        .prepare(
          "UPDATE platform_mail_outbox SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND state='pending' AND attempts<3 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING attempts",
        )
        .bind(token, now + 120000, row.id, now, now)
        .first<{ attempts: number }>()
    if (!claimed) continue
    try {
      const p = JSON.parse(row.payload_json),
        u = await db
          .prepare('SELECT * FROM platform_users WHERE id=?')
          .bind(row.user_id)
          .first<any>(),
        marked = await db
          .prepare('SELECT * FROM platform_account_deletions WHERE user_id=?')
          .bind(row.user_id)
          .first<any>()
      const valid =
        u &&
        (row.kind === 'account-deleted'
          ? marked?.generation === row.cycle
          : s.enabled &&
            !marked &&
            !(await accountExemption(db, row.user_id, s.exemptions!, now)) &&
            deletionDeadline(u, s) === p.deadline &&
            p.deadline > now)
      if (!valid) {
        await db
          .prepare(
            "UPDATE platform_mail_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          )
          .bind(row.id, token)
          .run()
        continue
      }
      await sendMail(
        db,
        email,
        row.kind as MailKind,
        row.to_email,
        p,
        row.kind === 'account-deleted'
          ? 'mailto:support@chronoframe.art'
          : portal + '/signin',
      )
      await db
        .prepare(
          "UPDATE platform_mail_outbox SET state='sent',lease_token=NULL,lease_until=NULL,error=NULL WHERE id=? AND lease_token=?",
        )
        .bind(row.id, token)
        .run()
    } catch {
      await db
        .prepare(
          'UPDATE platform_mail_outbox SET state=?,available_at=?,error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?',
        )
        .bind(
          claimed.attempts >= 3 ? 'failed' : 'pending',
          claimed.attempts >= 3
            ? now
            : now + 60000 * 2 ** (claimed.attempts - 1),
          claimed.attempts >= 3
            ? 'email_delivery_exhausted'
            : 'email_delivery_failed',
          row.id,
          token,
        )
        .run()
    }
  }
}
