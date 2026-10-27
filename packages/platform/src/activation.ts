import type { PlatformD1 } from './index.ts'
import {
  duration,
  durationEnd,
  extendDurationEnd,
  resolveSubscription,
  subscriptionInvalidation,
  SubscriptionError,
  type Duration,
} from './subscriptions.ts'
function invalid(): never {
  throw new SubscriptionError(400, 'invalid_activation_code')
}
const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
export function normalizeActivationCode(value: unknown) {
  if (typeof value !== 'string' || value.length > 256) invalid()
  const code = value.trim().toUpperCase()
  if (!code || code.length > 128 || /[\p{Cc}\p{Cf}]/u.test(code)) invalid()
  // Keep the digest identity of previously issued formatted codes.
  const legacy = code.replace(/[-\s]/g, '')
  return /^CF[0-9A-F]{32}$/.test(legacy) ? legacy : code
}
export async function activationHash(value: unknown) {
  const code = normalizeActivationCode(value)
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code),
  )
  return [...new Uint8Array(hash)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}
function randomCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  while (code.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(24))) {
      if (byte < 252) code += alphabet[byte % 36]
      if (code.length === 12) break
    }
  }
  return code
}
/** Raw codes are returned only to the generating operator; only digests are stored. */
export async function generateActivationCodes(
  input: {
    count: unknown
    planId: unknown
    duration: unknown
    redeemUntil?: unknown
    maxUses?: unknown
    code?: unknown
  },
  actor: number,
  now = Date.now(),
) {
  if (
    !Number.isSafeInteger(input.count) ||
    Number(input.count) < 1 ||
    Number(input.count) > 500 ||
    typeof input.planId !== 'string'
  )
    throw new SubscriptionError(400, 'invalid_code_batch')
  const custom =
    input.code === undefined || input.code === ''
      ? null
      : normalizeActivationCode(input.code)
  if (custom && input.count !== 1)
    throw new SubscriptionError(400, 'invalid_code_batch')
  const term = duration(input.duration),
    until = input.redeemUntil ?? null,
    max = input.maxUses ?? null
  if (
    (until !== null &&
      (!Number.isSafeInteger(until) || Number(until) <= now)) ||
    (max !== null &&
      (!Number.isSafeInteger(max) ||
        Number(max) < 1 ||
        Number(max) > 100000000))
  )
    throw new SubscriptionError(400, 'invalid_code_batch')
  const batchId = crypto.randomUUID(),
    codes: {
      id: string
      code: string
      hash: string
      display: string
      batchId: string
      planId: string
      duration: Duration
      redeemUntil: number | null
      maxUses: number | null
      createdAt: number
      createdBy: number
    }[] = []
  for (let i = 0; i < Number(input.count); i++) {
    let raw = custom ?? randomCode()
    while (codes.some((c) => c.code === raw)) raw = randomCode()
    codes.push({
      id: crypto.randomUUID(),
      code: raw,
      hash: await activationHash(raw),
      display: raw.length >= 8 ? '…' + raw.slice(-4) : '…',
      batchId,
      planId: input.planId,
      duration: term,
      redeemUntil: until as number | null,
      maxUses: max as number | null,
      createdAt: now,
      createdBy: actor,
    })
  }
  return { batchId, codes }
}
async function permitted(db: PlatformD1, userId: number, workspaceId: number) {
  const member = await db
    .prepare(
      "SELECT 1 FROM platform_memberships m JOIN platform_users u ON u.id=m.user_id LEFT JOIN platform_account_controls c ON c.user_id=u.id WHERE m.user_id=? AND m.workspace_id=? AND m.role='admin' AND u.email_verified=1 AND COALESCE(c.suspended,0)=0",
    )
    .bind(userId, workspaceId)
    .first()
  if (!member) throw new SubscriptionError(403, 'workspace_admin_required')
}
async function attempt(db: PlatformD1, userId: number, now: number) {
  const window = Math.floor(now / 900000) * 900000
  const row = await db
    .prepare(
      'INSERT INTO platform_activation_attempts(user_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET attempts=attempts+1 WHERE attempts<3 RETURNING attempts',
    )
    .bind(userId, window)
    .first()
  if (!row) throw new SubscriptionError(429, 'activation_rate_limit')
}
interface CodeRow {
  id: string
  plan_id: string
  name: string
  duration_unit: Duration['unit']
  duration_value: number | null
  revision: number
}
async function available(
  db: PlatformD1,
  hash: string,
  userId: number,
  now: number,
) {
  return db
    .prepare(
      `SELECT c.id,c.plan_id,p.name,c.duration_unit,c.duration_value,c.revision FROM platform_activation_codes c JOIN platform_plans p ON p.id=c.plan_id WHERE c.code_hash=? AND c.enabled=1 AND p.active=1 AND (c.redeem_until IS NULL OR c.redeem_until>?) AND (c.max_uses IS NULL OR c.uses<c.max_uses) AND NOT EXISTS(SELECT 1 FROM platform_activation_redemptions r WHERE r.code_id=c.id AND r.user_id=?)`,
    )
    .bind(hash, now, userId)
    .first<CodeRow>()
}
function effect(
  code: CodeRow,
  current: Awaited<ReturnType<typeof resolveSubscription>>,
  now: number,
) {
  const term: Duration = {
    unit: code.duration_unit,
    ...(code.duration_value === null ? {} : { value: code.duration_value }),
  }
  const same =
    current.id === code.plan_id &&
    !['default', 'expired_default'].includes(current.subscription.source)
  if (same && current.subscription.expiresAt === null)
    throw new SubscriptionError(409, 'permanent_plan_active')
  return {
    planId: code.plan_id,
    planName: code.name,
    mode: same ? 'extend' : 'replace',
    startsAt: same ? current.subscription.startsAt : now,
    expiresAt: same
      ? extendDurationEnd(
          current.subscription.startsAt,
          Math.max(now, current.subscription.expiresAt!),
          term,
        )
      : durationEnd(now, term),
    source: 'activation',
    interval: null,
  }
}
export async function previewActivation(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  value: unknown,
  now = Date.now(),
) {
  await permitted(db, userId, workspaceId)
  await attempt(db, userId, now)
  const hash = await activationHash(value),
    code = await available(db, hash, userId, now)
  if (!code) invalid()
  const current = await resolveSubscription(db, workspaceId, now)
  return {
    current: {
      planId: current.id,
      planName: current.name,
      expiresAt: current.subscription.expiresAt,
    },
    grant: effect(code, current, now),
    revision: current.assignment_revision,
  }
}
export async function redeemActivation(
  db: PlatformD1,
  userId: number,
  workspaceId: number,
  input: { code: unknown; requestId: unknown; revision: unknown },
  now = Date.now(),
) {
  await permitted(db, userId, workspaceId)
  if (
    !uuid(input.requestId) ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 0
  )
    throw new SubscriptionError(400, 'invalid_redemption')
  const previous = await db
    .prepare(
      'SELECT workspace_id,receipt_json FROM platform_activation_redemptions WHERE user_id=? AND request_id=?',
    )
    .bind(userId, input.requestId as string)
    .first<{ workspace_id: number; receipt_json: string }>()
  if (previous) {
    if (previous.workspace_id !== workspaceId)
      throw new SubscriptionError(409, 'redemption_changed')
    return JSON.parse(previous.receipt_json)
  }
  async function completedReceipt() {
    const row = await db
      .prepare(
        'SELECT workspace_id,receipt_json FROM platform_activation_redemptions WHERE user_id=? AND request_id=?',
      )
      .bind(userId, input.requestId as string)
      .first<{ workspace_id: number; receipt_json: string }>()
    if (row && row.workspace_id !== workspaceId)
      throw new SubscriptionError(409, 'redemption_changed')
    return row ? JSON.parse(row.receipt_json) : null
  }
  await attempt(db, userId, now)
  const hash = await activationHash(input.code),
    code = await available(db, hash, userId, now)
  if (!code) {
    const receipt = await completedReceipt()
    if (receipt) return receipt
    invalid()
  }
  const current = await resolveSubscription(db, workspaceId, now)
  if (current.assignment_revision !== input.revision) {
    const receipt = await completedReceipt()
    if (receipt) return receipt
    throw new SubscriptionError(409, 'subscription_changed')
  }
  const grant = effect(code, current, now),
    eventId = crypto.randomUUID(),
    receipt = {
      requestId: input.requestId,
      workspaceId,
      grant,
      redeemedAt: now,
    }
  const guard = `EXISTS(SELECT 1 FROM platform_activation_codes c JOIN platform_plans p ON p.id=c.plan_id WHERE c.id=? AND c.revision=? AND c.enabled=1 AND p.active=1 AND (c.redeem_until IS NULL OR c.redeem_until>?) AND (c.max_uses IS NULL OR c.uses<c.max_uses)) AND COALESCE((SELECT revision FROM platform_workspace_plans WHERE workspace_id=?),0)=? AND EXISTS(SELECT 1 FROM platform_memberships m JOIN platform_users u ON u.id=m.user_id LEFT JOIN platform_account_controls ac ON ac.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.role='admin' AND u.email_verified=1 AND COALESCE(ac.suspended,0)=0)`
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO platform_activation_redemptions(claim_id,code_id,user_id,workspace_id,request_id,receipt_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          eventId,
          code.id,
          userId,
          workspaceId,
          input.requestId as string,
          JSON.stringify(receipt),
          now,
          code.id,
          code.revision,
          now,
          workspaceId,
          Number(input.revision),
          workspaceId,
          userId,
        ),
      db
        .prepare(
          'UPDATE platform_activation_codes SET uses=uses+1 WHERE id=? AND EXISTS(SELECT 1 FROM platform_activation_redemptions WHERE claim_id=?)',
        )
        .bind(code.id, eventId),
      db
        .prepare(
          `INSERT INTO platform_workspace_plans(workspace_id,plan_id,starts_at,expires_at,source,billing_interval) SELECT ?,?,?,?,'activation',NULL WHERE EXISTS(SELECT 1 FROM platform_activation_redemptions WHERE claim_id=?) ON CONFLICT(workspace_id) DO UPDATE SET plan_id=excluded.plan_id,starts_at=excluded.starts_at,expires_at=excluded.expires_at,source='activation',billing_interval=NULL,revision=platform_workspace_plans.revision+1`,
        )
        .bind(
          workspaceId,
          grant.planId,
          grant.startsAt,
          grant.expiresAt,
          eventId,
        ),
      db
        .prepare(
          "INSERT INTO platform_subscription_events(id,workspace_id,actor_id,kind,before_json,after_json,created_at) SELECT ?,?,?,'redeemed',?,?,? WHERE EXISTS(SELECT 1 FROM platform_activation_redemptions WHERE claim_id=?)",
        )
        .bind(
          eventId,
          workspaceId,
          userId,
          JSON.stringify(current.subscription),
          JSON.stringify(grant),
          now,
          eventId,
        ),
      ...subscriptionInvalidation(db, workspaceId, eventId),
    ])
  } catch (error) {
    if (!/UNIQUE constraint/.test(String(error))) throw error
  }
  const result = await db
    .prepare(
      'SELECT workspace_id,receipt_json FROM platform_activation_redemptions WHERE user_id=? AND request_id=?',
    )
    .bind(userId, input.requestId as string)
    .first<{ workspace_id: number; receipt_json: string }>()
  if (!result) {
    const latest = await resolveSubscription(db, workspaceId, now)
    if (latest.assignment_revision !== Number(input.revision))
      throw new SubscriptionError(409, 'subscription_changed')
    invalid()
  }
  if (result.workspace_id !== workspaceId) invalid()
  return JSON.parse(result.receipt_json)
}
