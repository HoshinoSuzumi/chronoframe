import type { PlatformD1 } from './index.ts'
import { allRows } from './subscriptions.ts'
import { sendMail, type MailBinding } from './mail.ts'
/** Expired notices are useful only within one day of the entitlement ending. */
export const TRIAL_ENDED_MAX_AGE = 86400000
/** Deliver bounded, leased reminders; failures are reported without recipient data. */
export async function deliverTrialMail(
  db: PlatformD1,
  binding: MailBinding | undefined,
  portal: string,
  now = Date.now(),
  report: (stage: string, code?: string) => void = (stage, code) =>
    console.error('trial_mail_failed', stage, code ?? 'unknown'),
) {
  if (typeof binding?.send !== 'function') {
    report('binding_unavailable')
    return
  }
  // The queue is separate from deletion warnings, which have different validity rules.
  await db
    .prepare(`INSERT OR IGNORE INTO platform_trial_mail(id,user_id,cycle,notice_days,available_at)
 SELECT CAST(t.user_id AS TEXT)||':'||CAST(t.expires_at AS TEXT)||':'||CAST(CASE WHEN t.expires_at<=? THEN 0 WHEN t.expires_at<=? THEN 1 ELSE 3 END AS TEXT),t.user_id,t.expires_at,CASE WHEN t.expires_at<=? THEN 0 WHEN t.expires_at<=? THEN 1 ELSE 3 END,?
 FROM platform_trials t JOIN platform_users u ON u.id=t.user_id JOIN platform_workspaces w ON w.id=t.workspace_id AND w.owner_user_id=u.id JOIN platform_memberships membership ON membership.workspace_id=w.id AND membership.user_id=u.id AND membership.role='admin'
 WHERE t.revoked_at IS NULL AND t.converted_at IS NULL AND t.expires_at<=? AND t.expires_at>=? AND u.email_verified=1 AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=u.id AND c.suspended=1)
 AND NOT EXISTS(SELECT 1 FROM platform_trial_mail mail WHERE mail.user_id=t.user_id AND mail.cycle=t.expires_at AND mail.notice_days=CASE WHEN t.expires_at<=? THEN 0 WHEN t.expires_at<=? THEN 1 ELSE 3 END) ORDER BY t.expires_at,t.user_id LIMIT 50`)
    .bind(
      now,
      now + 86400000,
      now,
      now + 86400000,
      now,
      now + 3 * 86400000,
      now - TRIAL_ENDED_MAX_AGE,
      now,
      now + 86400000,
    )
    .run()
  await db
    .prepare(
      "UPDATE platform_trial_mail SET state='failed',lease_token=NULL,lease_until=NULL WHERE state='pending' AND attempts>=3 AND (lease_until IS NULL OR lease_until<?)",
    )
    .bind(now)
    .run()
  const rows = await allRows<{
    id: string
    user_id: number
    cycle: number
    notice_days: number
  }>(
    db
      .prepare(
        "SELECT id,user_id,cycle,notice_days FROM platform_trial_mail WHERE state='pending' AND attempts<3 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY available_at,id LIMIT 10",
      )
      .bind(now, now),
  )
  for (const row of rows) {
    const token = crypto.randomUUID()
    const claim = await db
      .prepare(
        "UPDATE platform_trial_mail SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND state='pending' AND attempts<3 AND available_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING attempts",
      )
      .bind(token, now + 120000, row.id, now, now)
      .first<{ attempts: number }>()
      .catch(() => {
        report('claim')
        return null
      })
    if (!claim) continue
    try {
      const record = await db
        .prepare(
          `SELECT u.email,w.name AS workspace,p.name AS plan FROM platform_trials t JOIN platform_users u ON u.id=t.user_id JOIN platform_workspaces w ON w.id=t.workspace_id JOIN platform_plans p ON p.id=t.plan_id JOIN platform_workspace_plans assignment ON assignment.workspace_id=w.id JOIN platform_memberships membership ON membership.workspace_id=w.id AND membership.user_id=u.id AND membership.role='admin' WHERE (assignment.source='trial' AND p.active=1 AND assignment.starts_at=t.started_at AND assignment.plan_id=t.plan_id OR assignment.source='expired_default' AND assignment.starts_at=t.expires_at) AND w.owner_user_id=u.id AND t.user_id=? AND t.expires_at=? AND t.revoked_at IS NULL AND t.converted_at IS NULL AND u.email_verified=1 AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=u.id AND c.suspended=1)`,
        )
        .bind(row.user_id, row.cycle)
        .first<{ email: string; workspace: string; plan: string }>()
      const remaining = row.cycle - now
      const valid =
        record &&
        (row.notice_days === 0
          ? remaining <= 0 && remaining >= -TRIAL_ENDED_MAX_AGE
          : remaining > 0 &&
            remaining <= row.notice_days * 86400000 &&
            (row.notice_days !== 3 || remaining > 86400000))
      if (!valid) {
        await db
          .prepare(
            "UPDATE platform_trial_mail SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
          )
          .bind(row.id, token)
          .run()
        continue
      }
      await sendMail(
        db,
        binding,
        row.notice_days === 0 ? 'trial-ended' : 'trial-ending',
        record.email,
        {
          workspace: record.workspace,
          trialPlan: record.plan,
          trialEndsAt: new Date(row.cycle)
            .toISOString()
            .replace('T', ' ')
            .replace('.000Z', ' UTC'),
        },
        portal + '/account/plan',
      )
      await db
        .prepare(
          "UPDATE platform_trial_mail SET state='sent',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        )
        .bind(row.id, token)
        .run()
    } catch (error: unknown) {
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^E_[A-Z_]{1,48}$/.test(error.code)
          ? error.code
          : undefined
      report('delivery', code)
      await db
        .prepare(
          'UPDATE platform_trial_mail SET state=?,available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?',
        )
        .bind(
          claim.attempts >= 3 ? 'failed' : 'pending',
          now + 60000 * 2 ** (claim.attempts - 1),
          row.id,
          token,
        )
        .run()
        .catch(() => report('retry_state'))
    }
  }
  await db
    .prepare(
      "DELETE FROM platform_trial_mail WHERE state IN('sent','cancelled','failed') AND cycle<>(SELECT expires_at FROM platform_trials WHERE user_id=platform_trial_mail.user_id) AND available_at<?",
    )
    .bind(now - 30 * 86400000)
    .run()
}
