import { createError } from 'h3'
import type { cloudMedia } from './cloud-media'
import {
  workspaceEntitlements,
  workspaceUsageSQL,
} from '@chronoframe/platform/entitlements'
interface AttachmentSource {
  id: string
  connection_id: string
  connection_revision: number
  source_version: string
  photo_revision: number
}
interface CompanionUpload {
  id: string
  state: string
  expires_at: number
  connection_id: string
  connection_revision: number
  object_key: string
  expected_bytes: number
}
export async function cloudLiveAttachment(
  ctx: Awaited<ReturnType<typeof cloudMedia>>,
  photoId: string,
  body: Record<string, unknown>,
  now: number,
) {
  const { raw, siteId, userId, site } = ctx
  if (body.phase === 'complete' && typeof body.uploadId === 'string') {
    const done = await raw
      .prepare(
        "SELECT c.upload_id FROM cloud_photo_companions c JOIN cloud_uploads u ON u.site_id=c.site_id AND u.id=c.upload_id JOIN cloud_photos p ON p.site_id=c.site_id AND p.id=c.photo_id WHERE c.site_id=? AND c.photo_id=? AND c.upload_id=? AND u.owner_id=? AND u.state='completed' AND p.deleted=0 AND p.source_version=u.source_version",
      )
      .bind(siteId, photoId, body.uploadId, userId)
      .first()
    if (done) return { ok: true }
  }
  if (
    typeof body.revision !== 'number' ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 1
  )
    throw createError({ statusCode: 400 })
  const source = await raw
    .prepare(
      "SELECT u.*,p.revision AS photo_revision FROM cloud_uploads u JOIN cloud_processing_jobs j ON j.site_id=u.site_id AND j.upload_id=u.id JOIN cloud_photos p ON p.site_id=j.site_id AND p.id=j.photo_id AND p.source_version=j.source_version WHERE p.site_id=? AND p.id=? AND p.deleted=0 AND p.metadata_json IS NOT NULL AND j.state IN('succeeded','failed','cancelled')",
    )
    .bind(siteId, photoId)
    .first<AttachmentSource>()
  if (!source || source.photo_revision !== body.revision)
    throw createError({ statusCode: 409 })
  const { s3 } = await ctx.storage(
    source.connection_id,
    source.connection_revision,
  )
  const stored = await ctx.vault.resolve(
    source.connection_id,
    source.connection_revision,
  )
  if (!stored) throw createError({ statusCode: 404 })
  const managed = 'poolId' in stored
  const plan = await workspaceEntitlements(
    raw,
    site.workspaceId,
    managed ? 'platform' : 'byos',
  )
  if (!managed && !plan.limits.byos) throw createError({ statusCode: 403 })
  if (body.phase === 'prepare') {
    if (
      typeof body.fileName !== 'string' ||
      !body.fileName.toLowerCase().endsWith('.mov') ||
      body.fileName.length > 255 ||
      typeof body.bytes !== 'number' ||
      !Number.isSafeInteger(body.bytes) ||
      body.bytes < 1 ||
      body.bytes > plan.limits.fileBytes ||
      body.bytes > 5368709120
    )
      throw createError({ statusCode: 400 })
    const id = crypto.randomUUID(),
      key = `chronoframe/${siteId}/live-attachments/${id}/source.MOV`,
      usage = workspaceUsageSQL(siteId)
    const result = await raw
      .prepare(
        `INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,connection_revision,object_key,expected_bytes,expires_at,content_type,file_name,reserved_storage_bytes) SELECT ?,?,?,?,?,?,?,?,?,?,'video/quicktime',?,? WHERE ${usage.monthly}+?<=? AND (?=0 OR ${usage.storage}+?<=?)`,
      )
      .bind(
        siteId,
        id,
        userId,
        photoId,
        source.source_version,
        source.connection_id,
        source.connection_revision,
        key,
        body.bytes,
        now + 3600000,
        body.fileName,
        managed ? body.bytes : 0,
        plan.quotaPeriod.start,
        now,
        body.bytes,
        plan.limits.monthlyBytes,
        managed ? 1 : 0,
        now,
        body.bytes,
        plan.limits.storageBytes,
      )
      .run()
    if (!result.meta.changes) throw createError({ statusCode: 429 })
    return { id, url: await s3.signPut(key, body.bytes, 'video/quicktime') }
  }
  if (body.phase !== 'complete' || typeof body.uploadId !== 'string')
    throw createError({ statusCode: 400 })
  const upload = await raw
    .prepare(
      "SELECT * FROM cloud_uploads WHERE site_id=? AND id=? AND photo_id=? AND owner_id=? AND source_version=? AND content_type='video/quicktime'",
    )
    .bind(siteId, body.uploadId, photoId, userId, source.source_version)
    .first<CompanionUpload>()
  if (
    !upload ||
    upload.state !== 'pending' ||
    upload.expires_at <= now ||
    upload.connection_id !== source.connection_id ||
    upload.connection_revision !== source.connection_revision
  )
    throw createError({ statusCode: 409 })
  const head = await s3.head(upload.object_key)
  if (
    head.bytes !== upload.expected_bytes ||
    head.contentType !== 'video/quicktime'
  )
    throw createError({ statusCode: 400 })
  const pipeline = `p_${String(Number(body.revision) + 1).padStart(16, '0')}_${crypto.randomUUID()}`
  const currentPair =
    "EXISTS(SELECT 1 FROM cloud_processing_jobs j JOIN cloud_photo_companions c ON c.site_id=j.site_id AND c.photo_id=j.photo_id WHERE j.site_id=? AND j.photo_id=? AND j.pipeline_version=? AND j.state='queued' AND c.upload_id=?)"
  const pairValues = [siteId, photoId, pipeline, upload.id] as const
  const result = await raw.batch([
    raw
      .prepare(
        "UPDATE cloud_photos SET revision=revision+1 WHERE site_id=? AND id=? AND revision=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=cloud_photos.site_id AND j.photo_id=cloud_photos.id AND j.state IN('queued','running','retry_wait'))",
      )
      .bind(siteId, photoId, body.revision),
    raw
      .prepare(
        "UPDATE cloud_uploads SET state='completed',verified_etag=? WHERE site_id=? AND id=? AND state='pending' AND expires_at>? AND changes()=1",
      )
      .bind(head.etag, siteId, upload.id, now),
    raw
      .prepare(
        'INSERT INTO cloud_usage_events(site_id,upload_id,bytes,created_at) SELECT ?,?,?,? WHERE changes()=1',
      )
      .bind(siteId, upload.id, upload.expected_bytes, now),
    raw
      .prepare(
        'INSERT INTO cloud_photo_companions(site_id,photo_id,upload_id) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(site_id,photo_id) DO UPDATE SET upload_id=excluded.upload_id',
      )
      .bind(siteId, photoId, upload.id),
    raw
      .prepare(
        "UPDATE cloud_processing_jobs SET state='queued',operation='live-photo',options_json=?,pipeline_version=?,attempts=0,error_code=NULL,attempt_id=NULL,worker_id=NULL,lease_until=NULL,available_at=?,reserved_output_bytes=0 WHERE site_id=? AND photo_id=? AND source_version=? AND state IN('succeeded','failed','cancelled') AND changes()=1",
      )
      .bind(
        JSON.stringify({ publicationRevision: body.revision + 1 }),
        pipeline,
        now,
        siteId,
        photoId,
        source.source_version,
      ),
    raw
      .prepare(`INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at)
      SELECT site_id,'superseded-companion-'||id,connection_id,connection_revision,object_key,? FROM cloud_uploads
      WHERE site_id=? AND photo_id=? AND content_type='video/quicktime' AND id<>? AND state='completed' AND ${currentPair} ON CONFLICT DO NOTHING`)
      .bind(now + 360000, siteId, photoId, upload.id, ...pairValues),
    raw
      .prepare(`UPDATE cloud_uploads SET state='cancelled' WHERE site_id=? AND photo_id=? AND content_type='video/quicktime' AND id<>? AND state='completed' AND ${currentPair}
      AND EXISTS(SELECT 1 FROM cloud_cleanup_requests cleanup WHERE cleanup.site_id=cloud_uploads.site_id AND cleanup.id='superseded-companion-'||cloud_uploads.id AND cleanup.object_key=cloud_uploads.object_key)`)
      .bind(siteId, photoId, upload.id, ...pairValues),
    raw
      .prepare(`INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at)
      SELECT site_id,'superseded-source-video-'||id,connection_id,connection_revision,video_key,? FROM cloud_uploads
      WHERE site_id=? AND id=? AND video_key IS NOT NULL AND ${currentPair} ON CONFLICT DO NOTHING`)
      .bind(now + 360000, siteId, source.id, ...pairValues),
    raw
      .prepare(`UPDATE cloud_uploads SET video_key=NULL,video_etag=NULL,expected_video_bytes=0 WHERE site_id=? AND id=? AND video_key IS NOT NULL AND ${currentPair}
      AND EXISTS(SELECT 1 FROM cloud_cleanup_requests cleanup WHERE cleanup.site_id=cloud_uploads.site_id AND cleanup.id='superseded-source-video-'||cloud_uploads.id AND cleanup.object_key=cloud_uploads.video_key)`)
      .bind(siteId, source.id, ...pairValues),
  ])
  if (!result[4]?.meta.changes) throw createError({ statusCode: 409 })
  return { ok: true }
}
