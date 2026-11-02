import type { PlatformD1 } from './index.ts'
import { SubscriptionError } from './subscriptions.ts'

export function parseMeasurementId(value: unknown) {
  if (typeof value !== 'string')
    throw new SubscriptionError(400, 'invalid_measurement_id')
  const id = value.trim()
  if (id && !/^G-[A-Z0-9]{4,20}$/.test(id))
    throw new SubscriptionError(400, 'invalid_measurement_id')
  return id
}

export async function cloudAnalyticsSettings(db: PlatformD1) {
  const row = await db
    .prepare(
      'SELECT measurement_id,revision FROM platform_cloud_analytics WHERE id=1',
    )
    .first<{ measurement_id: string; revision: number }>()
  if (!row)
    throw new SubscriptionError(503, 'analytics_configuration_unavailable')
  return { measurementId: row.measurement_id, revision: row.revision }
}

export async function saveCloudAnalytics(
  db: PlatformD1,
  actorId: number,
  input: Record<string, unknown>,
) {
  const measurementId = parseMeasurementId(input.measurementId)
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0)
    throw new SubscriptionError(400, 'invalid_revision')
  const before = await cloudAnalyticsSettings(db)
  const auditId = crypto.randomUUID()
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO platform_admin_audit(id,actor_id,action,target,reason,before_json,after_json,created_at) SELECT ?,?,'cloud-analytics-save','platform','Configure Cloud GA4',?,?,? WHERE EXISTS(SELECT 1 FROM platform_cloud_analytics WHERE id=1 AND revision=?)",
      )
      .bind(
        auditId,
        actorId,
        JSON.stringify(before),
        JSON.stringify({ measurementId }),
        Date.now(),
        Number(input.revision),
      ),
    db
      .prepare(
        'UPDATE platform_cloud_analytics SET measurement_id=?,revision=revision+1 WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM platform_admin_audit WHERE id=?)',
      )
      .bind(measurementId, Number(input.revision), auditId),
  ])
  if (!results[1]?.meta.changes)
    throw new SubscriptionError(409, 'analytics_configuration_changed')
  return cloudAnalyticsSettings(db)
}
