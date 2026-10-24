import { createError } from 'h3'
import type { PlatformD1 } from '../../../../packages/platform/src/index'
/** Tombstone and enqueue only exact managed object references in one transaction. */
export async function deleteCloudPhotos(
  db: PlatformD1,
  siteId: number,
  input: unknown,
  now: number,
) {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 1000 ||
    input.some(
      (id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id),
    )
  )
    throw createError({ statusCode: 400 })
  const ids = JSON.stringify([...new Set(input)])
  const found = await db
    .prepare(
      'SELECT COUNT(*) AS total FROM cloud_photos WHERE site_id=? AND id IN (SELECT value FROM json_each(?))',
    )
    .bind(siteId, ids)
    .first<{ total: number }>()
  if (found?.total !== new Set(input).size)
    throw createError({ statusCode: 404 })
  const selection = 'IN (SELECT value FROM json_each(?))'
  await db.batch([
    db
      .prepare(
        `UPDATE cloud_photos SET deleted=1 WHERE site_id=? AND id ${selection}`,
      )
      .bind(siteId, ids),
    db
      .prepare(
        `UPDATE cloud_processing_jobs SET state='cancelled' WHERE site_id=? AND photo_id ${selection} AND state IN ('queued','running','retry_wait')`,
      )
      .bind(siteId, ids),
    db
      .prepare(
        `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'original-'||id,connection_id,connection_revision,object_key,NULL,? FROM cloud_uploads WHERE site_id=? AND photo_id ${selection} ON CONFLICT DO NOTHING`,
      )
      .bind(now + 360000, siteId, ids),
    db
      .prepare(
        `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'video-'||id,connection_id,connection_revision,video_key,NULL,? FROM cloud_uploads WHERE site_id=? AND photo_id ${selection} AND video_key IS NOT NULL ON CONFLICT DO NOTHING`,
      )
      .bind(now + 360000, siteId, ids),
    db
      .prepare(
        `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'asset-'||photo_id||'-'||role,connection_id,connection_revision,object_key,NULL,? FROM cloud_media_assets WHERE site_id=? AND photo_id ${selection} ON CONFLICT DO NOTHING`,
      )
      .bind(now + 360000, siteId, ids),
  ])
  return { ok: true }
}
