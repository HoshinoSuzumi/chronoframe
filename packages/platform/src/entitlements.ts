import { resolveSubscription } from './subscriptions.ts'
import type { PlatformD1 } from './index.ts'

export const LIMIT_KEYS = [
  'byos',
  'storageBytes',
  'fileBytes',
  'sites',
  'customDomains',
  'photos',
  'monthlyBytes',
] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]
export type Limits = Record<LimitKey, number>
export const FREE_LIMITS: Limits = {
  byos: 0,
  storageBytes: 1073741824,
  fileBytes: 20971520,
  sites: 1,
  customDomains: 0,
  photos: 1000,
  monthlyBytes: 5368709120,
}
export type PolicyContext = {
  storageMode: 'platform' | 'byos'
  workspaceAgeDays: number
  emailVerified: boolean
}
type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | {
      field: keyof PolicyContext
      op: 'eq' | 'gte' | 'lte'
      value: string | number | boolean
    }
export interface PlanPolicy {
  limits: Limits
  rules: { when: Condition; limits: Partial<Limits> }[]
}
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export function validatePolicy(value: unknown): PlanPolicy {
  if (
    !plain(value) ||
    !plain(value.limits) ||
    !Array.isArray(value.rules) ||
    value.rules.length > 32 ||
    Object.keys(value).some((k) => !['limits', 'rules'].includes(k))
  )
    throw new Error('Invalid policy')
  function limits(v: unknown, complete: boolean) {
    if (
      !plain(v) ||
      Object.keys(v).some((k) => !LIMIT_KEYS.includes(k as LimitKey)) ||
      (complete && LIMIT_KEYS.some((k) => !(k in v)))
    )
      throw new Error('Invalid limits')
    if (Number(v.fileBytes ?? 0) > 1073741824 || Number(v.byos ?? 0) > 1)
      throw new Error('Unsupported limit')
    for (const n of Object.values(v))
      if (!Number.isSafeInteger(n) || Number(n) < 0)
        throw new Error('Limits must be non-negative safe integers')
  }
  if (Number(value.limits.byos) > 1) throw new Error('Invalid BYOS entitlement')
  if (Number(value.limits.fileBytes) > 1073741824)
    throw new Error('Maximum supported file size is 1 GiB')
  let nodes = 0
  function condition(v: unknown, depth = 0): void {
    if (!plain(v) || depth > 4 || ++nodes > 128)
      throw new Error('Invalid condition')
    if ('all' in v || 'any' in v) {
      const key = 'all' in v ? 'all' : 'any',
        children = v[key]
      if (
        Object.keys(v).length !== 1 ||
        !Array.isArray(children) ||
        !children.length ||
        children.length > 16
      )
        throw new Error('Invalid condition group')
      children.forEach((c) => condition(c, depth + 1))
      return
    }
    if (
      Object.keys(v).sort().join(',') !== 'field,op,value' ||
      !['storageMode', 'workspaceAgeDays', 'emailVerified'].includes(
        String(v.field),
      )
    )
      throw new Error('Invalid condition field')
    if (v.field === 'workspaceAgeDays') {
      if (
        !['eq', 'gte', 'lte'].includes(String(v.op)) ||
        !Number.isSafeInteger(v.value) ||
        Number(v.value) < 0
      )
        throw new Error('Invalid numeric condition')
    } else if (
      v.op !== 'eq' ||
      (v.field === 'storageMode'
        ? !['platform', 'byos'].includes(String(v.value))
        : typeof v.value !== 'boolean')
    )
      throw new Error('Invalid condition value')
  }
  limits(value.limits, true)
  for (const rule of value.rules) {
    if (!plain(rule) || Object.keys(rule).sort().join(',') !== 'limits,when')
      throw new Error('Invalid rule')
    condition(rule.when)
    limits(rule.limits, false)
    if (Number((rule.limits as Record<string, unknown>).byos ?? 0) > 1)
      throw new Error('Invalid BYOS entitlement')
  }
  return structuredClone(value) as unknown as PlanPolicy
}
export function evaluatePolicy(
  policy: PlanPolicy,
  context: PolicyContext,
): Limits {
  function matches(c: Condition): boolean {
    if ('all' in c) return c.all.every(matches)
    if ('any' in c) return c.any.some(matches)
    const a = context[c.field]
    return c.op === 'eq'
      ? a === c.value
      : c.op === 'gte'
        ? Number(a) >= Number(c.value)
        : Number(a) <= Number(c.value)
  }
  const limits = { ...policy.limits }
  for (const rule of policy.rules)
    if (matches(rule.when)) Object.assign(limits, rule.limits)
  return limits
}
export async function workspaceEntitlements(
  db: PlatformD1,
  workspaceId: number,
  storageMode: 'platform' | 'byos' = 'platform',
  now = Date.now(),
) {
  const row = await resolveSubscription(db, workspaceId, now)
  const context: PolicyContext = {
    storageMode,
    workspaceAgeDays: Math.max(
      0,
      Math.floor((now - Number(row.created_at)) / 86400000),
    ),
    emailVerified: !!row.email_verified,
  }
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    subscription: row.subscription,
    quotaPeriod: row.quotaPeriod,
    limits: evaluatePolicy(
      validatePolicy(JSON.parse(row.policy_json)),
      context,
    ),
  }
}

/** Correlated expressions keep admission and reservations in the same SQLite write. */
export function workspaceUsageSQL(siteId: number) {
  if (!Number.isSafeInteger(siteId) || siteId < 1)
    throw new Error('Site required')
  const sites = `SELECT id FROM platform_sites WHERE workspace_id=(SELECT workspace_id FROM platform_sites WHERE id=${siteId})`
  return {
    photos: `(SELECT COUNT(*) FROM cloud_photos WHERE site_id IN (${sites}) AND deleted=0)+(SELECT COUNT(*) FROM cloud_uploads WHERE site_id IN (${sites}) AND state='pending' AND expires_at>?)`,
    monthly: `COALESCE((SELECT SUM(bytes) FROM cloud_usage_events WHERE site_id IN (${sites}) AND created_at>=?),0)+COALESCE((SELECT SUM(expected_bytes+expected_video_bytes) FROM cloud_uploads WHERE site_id IN (${sites}) AND state='pending' AND expires_at>?),0)`,
    storage: `COALESCE((SELECT SUM(u.expected_bytes+u.expected_video_bytes) FROM cloud_uploads u JOIN cloud_photos p ON p.site_id=u.site_id AND p.id=u.photo_id JOIN cloud_storage_connections c ON c.site_id=u.site_id AND c.id=u.connection_id WHERE u.site_id IN (${sites}) AND u.state='completed' AND p.deleted=0 AND c.pool_id IS NOT NULL),0)
      +COALESCE((SELECT SUM(a.bytes) FROM cloud_media_assets a JOIN cloud_photos p ON p.site_id=a.site_id AND p.id=a.photo_id JOIN cloud_storage_connections c ON c.site_id=a.site_id AND c.id=a.connection_id WHERE a.site_id IN (${sites}) AND p.deleted=0 AND c.pool_id IS NOT NULL),0)
      +COALESCE((SELECT SUM(reserved_storage_bytes) FROM cloud_uploads WHERE site_id IN (${sites}) AND state='pending' AND expires_at>?),0)
      +COALESCE((SELECT SUM(reserved_output_bytes) FROM cloud_processing_jobs WHERE site_id IN (${sites}) AND state IN('queued','running','retry_wait')),0)`,
  }
}
