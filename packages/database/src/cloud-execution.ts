import {
  assertSiteContext,
  CoreError,
  type SiteContext,
  type CloudLease,
  type CloudExecutionRepository,
} from '@chronoframe/core'
import type { MediaDatabase, MediaStatement } from './cloud-media.ts'

function positive(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CoreError(400, 'Invalid clock or size')
  return value
}
function identifier(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new CoreError(400, 'Invalid worker identifier')
  return value
}
function leaseDuration(value: number) {
  if (!Number.isSafeInteger(value) || value < 1000 || value > 300_000)
    throw new CoreError(400, 'Invalid lease duration')
  return value
}
/** Source identity and live site eligibility are checked on every worker mutation. */
const activeSite = `EXISTS(SELECT 1 FROM platform_sites s WHERE s.id=cloud_processing_jobs.site_id AND s.suspended=0)`
const currentSource = `EXISTS(SELECT 1 FROM cloud_photos p WHERE p.site_id=cloud_processing_jobs.site_id AND p.id=cloud_processing_jobs.photo_id AND p.source_version=cloud_processing_jobs.source_version AND p.deleted=0)`

/** Database polling is intentional: job creation and enqueue are the same D1
 * transaction. No broker dual-write, public database endpoint or CF credential.
 */
export function createCloudExecutionRepository(
  db: MediaDatabase,
  site: SiteContext,
): CloudExecutionRepository {
  assertSiteContext(site)
  const siteId = site.id
  const stmt = (sql: string, ...values: (string | number | null)[]) =>
    db.prepare(sql).bind(...values)
  const rows = async <T>(s: MediaStatement) => (await s.all<T>()).results
  function own(lease: CloudLease) {
    if (lease.siteId !== siteId) throw new CoreError(403, 'Wrong lease Site')
    identifier(lease.attemptId)
    identifier(lease.workerId)
  }
  const valid = `site_id=? AND id=? AND attempt_id=? AND worker_id=? AND state='running' AND lease_until>? AND ${currentSource} AND ${activeSite}`
  const validValues = (lease: CloudLease, now: number) =>
    [lease.id, lease.attemptId, lease.workerId, positive(now)] as const
  async function changed(s: MediaStatement) {
    return (await rows<{ id: string }>(s)).length === 1
  }
  return {
    async claim(workerId, attemptId, now, leaseMs) {
      identifier(workerId)
      identifier(attemptId)
      positive(now)
      leaseDuration(leaseMs)
      if (!Number.isSafeInteger(now + leaseMs))
        throw new CoreError(400, 'Invalid lease expiry')
      await db.batch([
        stmt(
          `UPDATE cloud_processing_jobs SET state='failed',error_code='attempts_exhausted',lease_until=NULL WHERE site_id=? AND state='running' AND lease_until<=? AND attempts>=max_attempts AND ${activeSite}`,
          siteId,
          now,
        ),
        stmt(
          `UPDATE cloud_processing_jobs SET state='running',worker_id=?,attempt_id=?,lease_until=?,attempts=attempts+1,error_code=NULL
          WHERE site_id=? AND ${activeSite} AND id=(SELECT id FROM cloud_processing_jobs WHERE site_id=? AND attempts<max_attempts AND ${currentSource}
          AND ((state IN ('queued','retry_wait') AND available_at<=?) OR (state='running' AND lease_until<=?)) AND NOT EXISTS(SELECT 1 FROM cloud_processing_jobs active WHERE active.site_id=? AND active.state='running' AND active.lease_until>?) ORDER BY created_at,id LIMIT 1)`,
          workerId,
          attemptId,
          now + leaseMs,
          siteId,
          siteId,
          now,
          now,
          siteId,
          now,
        ),
        stmt(
          `UPDATE cloud_job_attempts SET state='expired',finished_at=? WHERE site_id=? AND state='running' AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=cloud_job_attempts.site_id AND j.id=cloud_job_attempts.job_id AND (j.attempt_id!=cloud_job_attempts.attempt_id OR j.state='failed'))`,
          now,
          siteId,
        ),
        stmt(
          `INSERT INTO cloud_job_attempts(site_id,job_id,attempt_id,worker_id,started_at,state)
          SELECT ?,id,attempt_id,worker_id,?,'running' FROM cloud_processing_jobs WHERE site_id=? AND attempt_id=? AND worker_id=? AND state='running'`,
          siteId,
          now,
          siteId,
          attemptId,
          workerId,
        ),
        stmt(
          `INSERT INTO cloud_site_dispatch(site_id,last_claim_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM cloud_processing_jobs WHERE site_id=? AND attempt_id=? AND worker_id=? AND state='running') ON CONFLICT(site_id) DO UPDATE SET last_claim_at=excluded.last_claim_at`,
          siteId,
          now,
          siteId,
          attemptId,
          workerId,
        ),
      ])
      const found = (
        await rows<Record<string, unknown>>(
          stmt(
            `SELECT j.*,u.connection_id,u.connection_revision,u.object_key,u.expected_bytes FROM cloud_processing_jobs j JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id WHERE j.site_id=? AND j.attempt_id=? AND j.worker_id=? AND j.state='running'`,
            siteId,
            attemptId,
            workerId,
          ),
        )
      )[0]
      if (!found) return null
      return {
        id: String(found.id),
        siteId,
        photoId: String(found.photo_id),
        sourceVersion: String(found.source_version),
        pipelineVersion: String(found.pipeline_version),
        attemptId,
        workerId,
        attempts: Number(found.attempts),
        connectionId: String(found.connection_id),
        connectionRevision: Number(found.connection_revision),
        objectKey: String(found.object_key),
        expectedBytes: Number(found.expected_bytes),
      }
    },
    async heartbeat(lease, now, leaseMs) {
      own(lease)
      leaseDuration(leaseMs)
      return changed(
        stmt(
          `UPDATE cloud_processing_jobs SET lease_until=? WHERE ${valid} RETURNING id`,
          now + leaseMs,
          siteId,
          ...validValues(lease, now),
        ),
      )
    },
    async complete(lease, result, now) {
      own(lease)
      positive(now)
      const canonical = (
        await rows<{
          photo_id: string
          source_version: string
          pipeline_version: string
          connection_id: string
          connection_revision: number
        }>(
          stmt(
            `SELECT j.photo_id,j.source_version,j.pipeline_version,u.connection_id,u.connection_revision FROM cloud_processing_jobs j JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id WHERE j.site_id=? AND j.id=? AND j.attempt_id=? AND j.worker_id=?`,
            siteId,
            lease.id,
            lease.attemptId,
            lease.workerId,
          ),
        )
      )[0]
      if (
        !canonical ||
        canonical.photo_id !== lease.photoId ||
        canonical.source_version !== lease.sourceVersion ||
        canonical.pipeline_version !== lease.pipelineVersion ||
        canonical.connection_id !== lease.connectionId ||
        canonical.connection_revision !== lease.connectionRevision
      )
        return false
      positive(result.width)
      positive(result.height)
      if (
        result.width > 65535 ||
        result.height > 65535 ||
        result.width * result.height > 100_000_000
      )
        throw new CoreError(400, 'Image dimensions exceed limits')
      const json = JSON.stringify({
        ...result.metadata,
        width: result.width,
        height: result.height,
      })
      if (
        new TextEncoder().encode(json).length > 65536 ||
        result.assets.length < 1 ||
        result.assets.length > 3 ||
        new Set(result.assets.map((a) => a.role)).size !== result.assets.length
      )
        throw new CoreError(400, 'Invalid media result')
      const prefix = `chronoframe/${siteId}/derived/${lease.photoId}/${lease.sourceVersion}/${lease.pipelineVersion}/${lease.attemptId}/`
      for (const asset of result.assets) {
        positive(asset.bytes)
        const suffix =
          asset.role === 'thumbnail'
            ? 'thumbnail.webp'
            : asset.role === 'display'
              ? 'display.jpeg'
              : asset.contentType === 'video/mp4'
                ? 'live-video.mp4'
                : 'live-video.mov'
        if (
          asset.objectKey !== prefix + suffix ||
          asset.contentType !==
            (asset.role === 'thumbnail'
              ? 'image/webp'
              : asset.role === 'display'
                ? 'image/jpeg'
                : asset.objectKey.endsWith('.mp4')
                  ? 'video/mp4'
                  : 'video/quicktime')
        )
          throw new CoreError(400, 'Unexpected media object')
      }
      if (!result.assets.some((a) => a.role === 'thumbnail'))
        throw new CoreError(400, 'Thumbnail required')
      // Each write repeats the active attempt/source predicate; the final state
      // change comes last, so rejected or stale callbacks cannot publish assets.
      await db.batch([
        stmt(
          `UPDATE cloud_photos SET metadata_json=? WHERE site_id=? AND id=? AND source_version=? AND deleted=0 AND EXISTS(SELECT 1 FROM cloud_processing_jobs WHERE ${valid})`,
          json,
          siteId,
          lease.photoId,
          lease.sourceVersion,
          siteId,
          ...validValues(lease, now),
        ),
        ...result.assets.map((asset) =>
          stmt(
            `INSERT INTO cloud_media_assets(site_id,photo_id,source_version,pipeline_version,role,connection_id,connection_revision,object_key,bytes,content_type)
          SELECT ?,photo_id,source_version,pipeline_version,?, ?,?,?,?,? FROM cloud_processing_jobs WHERE ${valid}
          ON CONFLICT DO UPDATE SET object_key=excluded.object_key,bytes=excluded.bytes,content_type=excluded.content_type`,
            siteId,
            asset.role,
            lease.connectionId,
            lease.connectionRevision,
            asset.objectKey,
            asset.bytes,
            asset.contentType,
            siteId,
            ...validValues(lease, now),
          ),
        ),
        stmt(
          `UPDATE cloud_job_attempts SET state='succeeded',finished_at=? WHERE site_id=? AND job_id=? AND attempt_id=? AND state='running' AND EXISTS(SELECT 1 FROM cloud_processing_jobs WHERE ${valid})`,
          now,
          siteId,
          lease.id,
          lease.attemptId,
          siteId,
          ...validValues(lease, now),
        ),
        stmt(
          `UPDATE cloud_processing_jobs SET state='succeeded',lease_until=NULL WHERE ${valid}`,
          siteId,
          ...validValues(lease, now),
        ),
      ])
      return (
        (
          await rows<{ id: string }>(
            stmt(
              `SELECT id FROM cloud_processing_jobs WHERE site_id=? AND id=? AND attempt_id=? AND worker_id=? AND state='succeeded' AND ${currentSource}`,
              siteId,
              lease.id,
              lease.attemptId,
              lease.workerId,
            ),
          )
        ).length === 1
      )
    },
    async fail(lease, code, retryable, now) {
      own(lease)
      positive(now)
      if (!/^[a-z_]{1,64}$/.test(code))
        throw new CoreError(400, 'Invalid error code')
      await db.batch([
        stmt(
          `UPDATE cloud_job_attempts SET state='failed',finished_at=? WHERE site_id=? AND job_id=? AND attempt_id=? AND EXISTS(SELECT 1 FROM cloud_processing_jobs WHERE ${valid})`,
          now,
          siteId,
          lease.id,
          lease.attemptId,
          siteId,
          ...validValues(lease, now),
        ),
        stmt(
          `UPDATE cloud_processing_jobs SET state=CASE WHEN ?=1 AND attempts<max_attempts THEN 'retry_wait' ELSE 'failed' END,available_at=?,error_code=?,lease_until=NULL WHERE ${valid}`,
          retryable ? 1 : 0,
          now + Math.min(1000 * 2 ** Math.max(0, lease.attempts - 1), 30000),
          code,
          siteId,
          ...validValues(lease, now),
        ),
      ])
      return (
        (
          await rows<{ id: string }>(
            stmt(
              `SELECT id FROM cloud_processing_jobs WHERE site_id=? AND id=? AND attempt_id=? AND state IN ('retry_wait','failed')`,
              siteId,
              lease.id,
              lease.attemptId,
            ),
          )
        ).length === 1
      )
    },
  }
}
