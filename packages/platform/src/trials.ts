import type { PlatformD1 } from './index.ts'
import type {
  WorkspaceTrial,
  TrialBlock,
} from '@chronoframe/contracts/platform-setup'
import {
  SubscriptionError,
  EXPIRY_PLAN_SQL,
  subscriptionInvalidation,
} from './subscriptions.ts'
import {
  validatePolicy,
  evaluatePolicy,
  workspaceEntitlements,
} from './entitlements.ts'
interface Claim {
  user_id: number
  workspace_id: number | null
  plan_id: string
  plan_name: string
  started_at: number
  expires_at: number
  revoked_at: number | null
  converted_at: number | null
  revision: number
  assignment_plan_id: string | null
  assignment_active: number | null
  assignment_source: string | null
  assignment_starts_at: number | null
  assignment_expires_at: number | null
}
interface Settings {
  enabled: number
  plan_id: string | null
  plan_name: string | null
  days: number
  starts_at: number | null
  ends_at: number | null
  revision: number
  plan_revision: number | null
  active: number | null
  policy_json: string | null
}
/** Read the offer together with the current plan revision used for confirmation. */
export async function trialSettings(db: PlatformD1) {
  const row = await db
    .prepare(
      'SELECT s.*,p.name AS plan_name,p.active,p.revision AS plan_revision,p.policy_json FROM platform_trial_settings s LEFT JOIN platform_plans p ON p.id=s.plan_id WHERE s.id=1',
    )
    .first<Settings>()
  if (!row) throw new SubscriptionError(503, 'trial_unavailable')
  return row
}
const accountEligible =
  'u.email_verified=1 AND NOT EXISTS(SELECT 1 FROM platform_account_controls c WHERE c.user_id=u.id AND c.suspended=1) AND NOT EXISTS(SELECT 1 FROM platform_account_deletions d WHERE d.user_id=u.id)'
const noPending =
  "NOT EXISTS(SELECT 1 FROM platform_payment_checkouts c WHERE c.workspace_id=w.id AND c.state IN('creating','open','uncertain')) AND NOT EXISTS(SELECT 1 FROM platform_payment_subscriptions s WHERE s.workspace_id=w.id AND (s.activation_state='authorized' OR s.period_end>? AND s.status IN('active','trialing','scheduled_cancel','past_due','on_hold')))"
/** Resolve eligibility and trial state against live ownership and entitlements. */
export async function workspaceTrial(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  now = Date.now(),
): Promise<WorkspaceTrial> {
  const row = await db
    .prepare(
      `SELECT w.owner_user_id,w.created_at,m.role,u.email_verified,CASE WHEN ${accountEligible} THEN 1 ELSE 0 END AS available,p.plan_id,p.source,p.starts_at,p.expires_at FROM platform_workspaces w JOIN platform_memberships m ON m.workspace_id=w.id AND m.user_id=? JOIN platform_users u ON u.id=m.user_id LEFT JOIN platform_workspace_plans p ON p.workspace_id=w.id WHERE w.id=?`,
    )
    .bind(userId, workspaceId)
    .first<{
      owner_user_id: number
      created_at: number
      role: string
      email_verified: number
      available: number
      plan_id: string | null
      source: string | null
      starts_at: number | null
      expires_at: number | null
    }>()
  if (!row) throw new SubscriptionError(403, 'workspace_unavailable')
  const [settings, claim, fallback] = await Promise.all([
    trialSettings(db),
    db
      .prepare(
        'SELECT t.*,p.name AS plan_name,assignment.plan_id AS assignment_plan_id,assigned.active AS assignment_active,assignment.source AS assignment_source,assignment.starts_at AS assignment_starts_at,assignment.expires_at AS assignment_expires_at FROM platform_trials t JOIN platform_plans p ON p.id=t.plan_id LEFT JOIN platform_workspace_plans assignment ON assignment.workspace_id=t.workspace_id LEFT JOIN platform_plans assigned ON assigned.id=assignment.plan_id WHERE t.user_id=?',
      )
      .bind(userId)
      .first<Claim>(),
    db
      .prepare(`SELECT id,name FROM platform_plans WHERE id=${EXPIRY_PLAN_SQL}`)
      .first<{ id: string; name: string }>(),
  ])
  let reason: TrialBlock | null = null
  if (row.owner_user_id !== userId || row.role !== 'admin') reason = 'not_owner'
  else if (!row.email_verified) reason = 'unverified'
  else if (!row.available) reason = 'account_unavailable'
  else if (claim) reason = 'already_used'
  else if (
    !settings.enabled ||
    !settings.active ||
    !settings.plan_id ||
    settings.plan_id === 'free'
  )
    reason = 'disabled'
  else if (settings.starts_at !== null && now < settings.starts_at)
    reason = 'not_started'
  else if (settings.ends_at !== null && now >= settings.ends_at)
    reason = 'ended'
  else if (
    !(await db
      .prepare(
        `SELECT 1 FROM platform_workspaces w WHERE w.id=? AND ${noPending}`,
      )
      .bind(workspaceId, now)
      .first())
  )
    reason = 'pending_payment'
  else {
    const effective = await workspaceEntitlements(
      db,
      workspaceId,
      'platform',
      now,
    )
    if (
      effective.id !== 'free' ||
      (row.source &&
        !['default', 'expired_default', 'manual', 'trial'].includes(
          row.source,
        ) &&
        (row.expires_at === null || row.expires_at > now))
    )
      reason = 'existing_entitlement'
  }
  const policy =
    settings.plan_id && settings.active && settings.policy_json
      ? validatePolicy(JSON.parse(settings.policy_json))
      : null
  const offer = policy
    ? {
        limits: evaluatePolicy(policy, {
          storageMode: 'platform',
          workspaceAgeDays: Math.max(
            0,
            Math.floor((now - row.created_at) / 86400000),
          ),
          emailVerified: !!row.email_verified,
        }),
        analytics: policy.analytics === true,
      }
    : null
  return {
    serverTime: now,
    eligible: reason === null,
    reason,
    offer:
      offer && settings.plan_id
        ? {
            planId: settings.plan_id,
            planName: settings.plan_name!,
            days: settings.days,
            revision: `${settings.revision}:${settings.plan_revision}`,
            limits: offer.limits,
            analytics: offer.analytics,
          }
        : null,
    fallback: fallback ?? { id: 'free', name: 'Free' },
    trial: claim
      ? {
          workspaceId: claim.workspace_id,
          planName: claim.plan_name,
          startedAt: claim.started_at,
          expiresAt: claim.expires_at,
          state: claim.converted_at
            ? 'converted'
            : claim.revoked_at
              ? 'revoked'
              : claim.expires_at > now &&
                  claim.assignment_active === 1 &&
                  claim.assignment_plan_id === claim.plan_id &&
                  (claim.assignment_expires_at === null ||
                    claim.assignment_expires_at > now) &&
                  claim.assignment_source === 'trial' &&
                  claim.assignment_starts_at === claim.started_at
                ? 'active'
                : 'expired',
        }
      : null,
  }
}
/** Grant one account trial with atomic offer, assignment and payment guards. */
export async function claimWorkspaceTrial(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  revision: unknown,
  now = Date.now(),
) {
  if (typeof revision !== 'string' || !/^\d+:\d+$/.test(revision))
    throw new SubscriptionError(400, 'invalid_trial_request')
  const status = await workspaceTrial(db, userId, workspaceId, now)
  if (status.trial?.workspaceId === workspaceId) return status
  if (!status.eligible)
    throw new SubscriptionError(409, status.reason ?? 'trial_unavailable')
  if (!status.offer || status.offer.revision !== revision)
    throw new SubscriptionError(409, 'configuration_changed')
  const [settingsRevision, planRevision] = String(revision)
    .split(':')
    .map(Number)
  if (
    !Number.isSafeInteger(settingsRevision) ||
    !Number.isSafeInteger(planRevision)
  )
    throw new SubscriptionError(400, 'invalid_trial_request')
  const expires = now + status.offer.days * 86400000
  const assignment = await db
    .prepare(
      'SELECT revision FROM platform_workspace_plans WHERE workspace_id=?',
    )
    .bind(workspaceId)
    .first<{ revision: number }>()
  if (!assignment) throw new SubscriptionError(409, 'existing_entitlement')
  const guard = `SELECT u.id,w.id,s.plan_id,s.revision,?,? FROM platform_users u JOIN platform_workspaces w ON w.owner_user_id=u.id JOIN platform_memberships m ON m.workspace_id=w.id AND m.user_id=u.id AND m.role='admin' JOIN platform_trial_settings s ON s.id=1 JOIN platform_plans offered ON offered.id=s.plan_id AND offered.active=1 JOIN platform_workspace_plans p ON p.workspace_id=w.id JOIN platform_plans current ON current.id=p.plan_id WHERE u.id=? AND w.id=? AND ${accountEligible} AND s.enabled=1 AND s.revision=? AND offered.revision=? AND s.plan_id=? AND (s.starts_at IS NULL OR s.starts_at<=?) AND (s.ends_at IS NULL OR s.ends_at>?) AND p.revision=? AND CASE WHEN current.active=1 AND p.source<>'expired_default' AND (p.expires_at IS NULL OR p.expires_at>?) THEN p.plan_id ELSE ${EXPIRY_PLAN_SQL} END='free' AND (p.source IN('default','expired_default','manual') OR p.expires_at<=?) AND ${noPending}`
  const eventId = crypto.randomUUID()
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO platform_trials(user_id,workspace_id,plan_id,settings_revision,started_at,expires_at) ${guard} ON CONFLICT(user_id) DO NOTHING`,
        )
        .bind(
          now,
          expires,
          userId,
          workspaceId,
          settingsRevision!,
          planRevision!,
          status.offer.planId,
          now,
          now,
          assignment.revision,
          now,
          now,
          now,
        ),
      db
        .prepare(
          "UPDATE platform_workspace_plans SET plan_id=?,starts_at=?,expires_at=?,source='trial',billing_interval=NULL,payment_subscription_id=NULL,revision=revision+1 WHERE changes()=1 AND workspace_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_trials WHERE user_id=? AND workspace_id=? AND started_at=? AND expires_at=?)",
        )
        .bind(
          status.offer.planId,
          now,
          expires,
          workspaceId,
          assignment.revision,
          userId,
          workspaceId,
          now,
          expires,
        ),
      db
        .prepare(
          "INSERT INTO platform_subscription_events(id,workspace_id,kind,before_json,after_json,created_at) SELECT ?,?,'trial_started',?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM platform_trials WHERE user_id=? AND started_at=?) AND EXISTS(SELECT 1 FROM platform_workspace_plans WHERE workspace_id=? AND source='trial' AND starts_at=? AND revision=?)",
        )
        .bind(
          eventId,
          workspaceId,
          JSON.stringify({ planId: 'free' }),
          JSON.stringify({ planId: status.offer.planId, expiresAt: expires }),
          now,
          userId,
          now,
          workspaceId,
          now,
          assignment.revision + 1,
        ),
      ...subscriptionInvalidation(db, workspaceId, eventId),
    ])
  } catch (error) {
    if (!String(error).includes('UNIQUE constraint failed: platform_trials'))
      throw error
  }
  const result = await workspaceTrial(db, userId, workspaceId, now)
  if (!result.trial || result.trial.workspaceId !== workspaceId)
    throw new SubscriptionError(409, 'configuration_changed')
  return result
}
/** Current eligible account count, independent of the reporting cohort. */
export async function trialEligibleCount(db: PlatformD1, now = Date.now()) {
  const settings = await trialSettings(db)
  if (
    !settings.enabled ||
    !settings.active ||
    !settings.plan_id ||
    settings.plan_id === 'free' ||
    (settings.starts_at !== null && now < settings.starts_at) ||
    (settings.ends_at !== null && now >= settings.ends_at)
  )
    return 0
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM platform_users u JOIN platform_workspaces w ON w.owner_user_id=u.id JOIN platform_memberships m ON m.workspace_id=w.id AND m.user_id=u.id AND m.role='admin' JOIN platform_workspace_plans p ON p.workspace_id=w.id JOIN platform_plans current ON current.id=p.plan_id WHERE ${accountEligible} AND NOT EXISTS(SELECT 1 FROM platform_trials t WHERE t.user_id=u.id OR t.workspace_id=w.id) AND CASE WHEN current.active=1 AND p.source<>'expired_default' AND (p.expires_at IS NULL OR p.expires_at>?) THEN p.plan_id ELSE ${EXPIRY_PLAN_SQL} END='free' AND (p.source IN('default','expired_default','manual') OR p.expires_at<=?) AND ${noPending}`,
    )
    .bind(now, now, now)
    .first<{ count: number }>()
  return result?.count ?? 0
}
