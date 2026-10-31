import { createError } from 'h3'
import type { PlatformD1 } from '../../../../packages/platform/src/index'
/** Reuse the immutable source and attempt history; old published assets stay visible while rebuilding. */
export async function queuePhotoProcessing(
  db: PlatformD1,
  siteId: number,
  photoId: string,
  operation: string,
  revision: number,
  options: Record<string, unknown> = {},
) {
  if (
    !['reindex', 'geocoding', 'erase-location', 'live-photo', 'photo'].includes(
      operation,
    ) ||
    !Number.isSafeInteger(revision)
  )
    throw createError({ statusCode: 400 })
  const now = Date.now(),
    pipeline = `p_${String(revision + 1).padStart(16, '0')}_${crypto.randomUUID()}`
  const results = await db.batch([
    db
      .prepare(
        "UPDATE cloud_photos SET revision=revision+1 WHERE site_id=? AND id=? AND deleted=0 AND revision=? AND metadata_json IS NOT NULL AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=cloud_photos.site_id AND j.photo_id=cloud_photos.id AND j.source_version=cloud_photos.source_version AND j.state IN('succeeded','failed','cancelled')) AND NOT EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=cloud_photos.site_id AND j.photo_id=cloud_photos.id AND j.state IN('queued','running','retry_wait'))",
      )
      .bind(siteId, photoId, revision),
    db
      .prepare(
        "UPDATE cloud_processing_jobs SET state='queued',operation=?,options_json=?,pipeline_version=?,attempts=0,error_code=NULL,attempt_id=NULL,worker_id=NULL,lease_until=NULL,available_at=?,reserved_output_bytes=0 WHERE site_id=? AND photo_id=? AND source_version=(SELECT source_version FROM cloud_photos WHERE site_id=? AND id=?) AND changes()=1",
      )
      .bind(
        operation,
        JSON.stringify({ ...options, publicationRevision: revision + 1 }),
        pipeline,
        now,
        siteId,
        photoId,
        siteId,
        photoId,
      ),
  ])
  if (!results[1]?.meta.changes)
    throw createError({
      statusCode: 409,
      statusMessage: 'Photo changed or processing already queued',
    })
  return { ok: true, revision: revision + 1 }
}
