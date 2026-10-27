import {
  workspaceEntitlements,
  workspaceUsageSQL,
} from '@chronoframe/platform/entitlements'
import { createError, getHeader, getRequestWebStream, getRouterParam } from 'h3'
import { createCloudExecutionRepository } from '@chronoframe/database/cloud-execution'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import type { CloudLease, CloudMediaResult } from '@chronoframe/core'
import { createCloudS3 } from '@chronoframe/storage/s3-edge'
import { createStorageCipher } from '@chronoframe/storage/credential-cipher'
import { createStorageVault } from '../../../../../../packages/platform/src/index'
import {
  definePlatformHandler,
  platformDatabase,
  platformPortalOrigin,
} from '../../../../../shared/platform/runtime'
import { readSiteBody } from '../../../utils/site-body'
export default definePlatformHandler(async (event) => {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin)
  if (
    config.workerSecret.length < 32 ||
    !getHeader(event, 'content-type')?.startsWith('application/json')
  )
    throw createError({ statusCode: 503 })
  const supplied =
    getHeader(event, 'authorization')?.replace(/^Bearer /, '') ?? ''
  if (supplied.length > 256) throw createError({ statusCode: 401 })
  const encoder = new TextEncoder(),
    key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(config.workerSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  const proof = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(config.workerSecret),
  )
  if (
    !(await crypto.subtle.verify('HMAC', key, proof, encoder.encode(supplied)))
  )
    throw createError({ statusCode: 401 })
  const body = await readSiteBody(getRequestWebStream(event), 98304),
    action = getRouterParam(event, 'action'),
    now = Date.now()
  const raw = platformDatabase(event),
    db = raw as unknown as MediaDatabase
  const allowedHosts = config.s3EndpointHosts
    .split(',')
    .map((h: string) => h.trim())
    .filter(Boolean)
  async function storage(siteId: number, id: string, revision: number) {
    const item = await createStorageVault(
      raw,
      siteId,
      await createStorageCipher(config.storageSecret),
    ).resolve(id, revision)
    if (!item) throw createError({ statusCode: 503 })
    return createCloudS3(
      { ...item.config, ...item.credentials },
      {
        allowedHosts:
          'poolId' in item
            ? [...allowedHosts, new URL(item.config.endpoint).hostname]
            : allowedHosts,
      },
    )
  }
  if (action === 'claim') {
    if (
      typeof body.workerId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(body.workerId)
    )
      throw createError({ statusCode: 400 })
    const candidates = (
      await db
        .prepare(
          `SELECT j.site_id,MIN(j.created_at) oldest FROM cloud_processing_jobs j JOIN platform_sites s ON s.id=j.site_id AND s.suspended=0 LEFT JOIN cloud_site_dispatch d ON d.site_id=j.site_id WHERE ((state IN ('queued','retry_wait') AND available_at<=?) OR (state='running' AND lease_until<=?)) AND NOT EXISTS(SELECT 1 FROM cloud_processing_jobs active WHERE active.site_id=j.site_id AND active.state='running' AND active.lease_until>?) GROUP BY j.site_id ORDER BY COALESCE(d.last_claim_at,0),oldest,j.site_id LIMIT 10`,
        )
        .bind(now, now, now)
        .all<{ site_id: number }>()
    ).results
    for (const candidate of candidates) {
      const lease = await createCloudExecutionRepository(db, {
        id: candidate.site_id,
      }).claim(body.workerId, crypto.randomUUID(), now, 120000)
      if (!lease) continue
      // A deletion mark may race the candidate query. Do not issue fresh transport capabilities.
      if (
        !(await db
          .prepare('SELECT id FROM platform_sites WHERE id=? AND suspended=0')
          .bind(lease.siteId)
          .first())
      )
        continue
      const s3 = await storage(
        lease.siteId,
        lease.connectionId,
        lease.connectionRevision,
      )
      const detail = await raw
        .prepare(
          'SELECT file_name,content_type,verified_etag,video_key,video_etag,expected_video_bytes FROM cloud_uploads WHERE site_id=? AND photo_id=? AND source_version=?',
        )
        .bind(lease.siteId, lease.photoId, lease.sourceVersion)
        .first<{
          file_name: string
          content_type: string
          verified_etag: string | null
          video_key: string | null
          video_etag: string | null
          expected_video_bytes: number
        }>()
      return {
        lease,
        sourceUrl: await s3.signGet(lease.objectKey),
        fileName: detail?.file_name,
        contentType: detail?.content_type,
        etag: detail?.verified_etag,
        companion: detail?.video_key
          ? {
              key: detail.video_key,
              url: await s3.signGet(detail.video_key),
              bytes: detail.expected_video_bytes,
              etag: detail.video_etag,
            }
          : null,
      }
    }
    return { lease: null }
  }
  if (action === 'cleanup') {
    const expired = (
      await db
        .prepare(
          `SELECT site_id,id,connection_id,connection_revision,object_key,video_key,provider_upload_id FROM cloud_uploads WHERE state='pending' AND expires_at<=? ORDER BY expires_at LIMIT 10`,
        )
        .bind(now)
        .all<{
          site_id: number
          id: string
          connection_id: string
          connection_revision: number
          object_key: string
          video_key: string | null
          provider_upload_id: string | null
        }>()
    ).results
    for (const u of expired)
      await db.batch([
        db
          .prepare(
            `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cloud_uploads WHERE site_id=? AND id=? AND state='pending' AND expires_at<=?) ON CONFLICT DO NOTHING`,
          )
          .bind(
            u.site_id,
            'upload-' + u.id,
            u.connection_id,
            u.connection_revision,
            u.object_key,
            u.provider_upload_id,
            now + 360000,
            u.site_id,
            u.id,
            now,
          ),
        db
          .prepare(
            `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at) SELECT ?,?,?,?,?,? WHERE ? IS NOT NULL AND EXISTS(SELECT 1 FROM cloud_uploads WHERE site_id=? AND id=? AND state='pending' AND expires_at<=?) ON CONFLICT DO NOTHING`,
          )
          .bind(
            u.site_id,
            'upload-video-' + u.id,
            u.connection_id,
            u.connection_revision,
            u.video_key,
            now + 360000,
            u.video_key,
            u.site_id,
            u.id,
            now,
          ),
        db
          .prepare(
            `UPDATE cloud_uploads SET state='cancelled' WHERE site_id=? AND id=? AND state='pending' AND expires_at<=?`,
          )
          .bind(u.site_id, u.id, now),
      ])
    const abandoned = (
      await db
        .prepare(
          `SELECT a.site_id,a.attempt_id,j.photo_id,j.source_version,j.pipeline_version,u.connection_id,u.connection_revision FROM cloud_job_attempts a JOIN cloud_processing_jobs j ON j.site_id=a.site_id AND j.id=a.job_id JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id WHERE (a.state IN ('expired','failed','cancelled') OR j.state='cancelled') AND NOT EXISTS(SELECT 1 FROM cloud_cleanup_requests c WHERE c.site_id=a.site_id AND c.id='attempt-'||a.attempt_id||'-thumbnail.webp') LIMIT 10`,
        )
        .all<{
          site_id: number
          attempt_id: string
          photo_id: string
          source_version: string
          pipeline_version: string
          connection_id: string
          connection_revision: number
        }>()
    ).results
    for (const old of abandoned)
      for (const name of [
        'thumbnail.webp',
        'display.jpeg',
        'live-video.mp4',
        'live-video.mov',
      ])
        await raw
          .prepare(
            `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
          )
          .bind(
            old.site_id,
            'attempt-' + old.attempt_id + '-' + name,
            old.connection_id,
            old.connection_revision,
            `chronoframe/${old.site_id}/derived/${old.photo_id}/${old.source_version}/${old.pipeline_version}/${old.attempt_id}/${name}`,
            now + 360000,
          )
          .run()
    const pending = (
      await db
        .prepare(
          `SELECT * FROM cloud_cleanup_requests WHERE state='pending' AND available_at<=? AND attempts<10 LIMIT 2`,
        )
        .bind(now)
        .all<{
          site_id: number
          id: string
          connection_id: string
          connection_revision: number
          object_key: string
          provider_upload_id: string | null
          attempts: number
        }>()
    ).results
    let done = 0
    for (const item of pending) {
      try {
        const s3 = await storage(
          item.site_id,
          item.connection_id,
          item.connection_revision,
        )
        if (!item.provider_upload_id && item.id.startsWith('upload-'))
          for (const orphan of await s3.recoverMultipart(item.object_key))
            await s3.abort(item.object_key, orphan)
        if (item.provider_upload_id)
          await s3
            .abort(item.object_key, item.provider_upload_id)
            .catch((error) => {
              if (error?.name !== 'NoSuchUpload') throw error
            })
        await s3.remove(item.object_key)
        await raw
          .prepare(
            "UPDATE cloud_cleanup_requests SET state='done',attempts=attempts+1 WHERE site_id=? AND id=?",
          )
          .bind(item.site_id, item.id)
          .run()
        done++
      } catch {
        await raw
          .prepare(
            'UPDATE cloud_cleanup_requests SET attempts=attempts+1,available_at=? WHERE site_id=? AND id=?',
          )
          .bind(
            now + Math.min(60000 * 2 ** item.attempts, 86400000),
            item.site_id,
            item.id,
          )
          .run()
      }
    }
    return { done }
  }
  const lease = body.lease as CloudLease
  if (
    !lease ||
    !Number.isSafeInteger(lease.siteId) ||
    typeof lease.id !== 'string'
  )
    throw createError({ statusCode: 400 })
  const queue = createCloudExecutionRepository(db, { id: lease.siteId })
  if (action === 'heartbeat')
    return { ok: await queue.heartbeat(lease, now, 120000) }
  if (action === 'fail')
    return {
      ok: await queue.fail(
        lease,
        typeof body.code === 'string' ? body.code : 'processing_error',
        body.retryable === true,
        now,
      ),
    }
  if (action === 'grant') {
    if (!(await queue.heartbeat(lease, now, 120000)))
      throw createError({ statusCode: 409 })
    const canonical = await raw
      .prepare(
        'SELECT j.photo_id,j.source_version,j.pipeline_version,u.connection_id,u.connection_revision FROM cloud_processing_jobs j JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id WHERE j.site_id=? AND j.id=? AND j.attempt_id=?',
      )
      .bind(lease.siteId, lease.id, lease.attemptId)
      .first<{
        photo_id: string
        source_version: string
        pipeline_version: string
        connection_id: string
        connection_revision: number
      }>()
    if (
      !canonical ||
      canonical.photo_id !== lease.photoId ||
      canonical.source_version !== lease.sourceVersion ||
      canonical.pipeline_version !== lease.pipelineVersion ||
      canonical.connection_id !== lease.connectionId ||
      canonical.connection_revision !== lease.connectionRevision
    )
      throw createError({ statusCode: 403 })
    if (
      !Array.isArray(body.assets) ||
      body.assets.length > 3 ||
      body.assets.length < 1
    )
      throw createError({ statusCode: 400 })
    const s3 = await storage(
      lease.siteId,
      lease.connectionId,
      lease.connectionRevision,
    )
    const declared = body.assets as {
      role: string
      bytes: number
      contentType: string
    }[]
    if (
      declared.some((a) => !Number.isSafeInteger(a.bytes) || a.bytes < 1) ||
      new Set(declared.map((a) => a.role)).size !== declared.length
    )
      throw createError({ statusCode: 400 })
    const outputBytes = declared.reduce((n, a) => n + a.bytes, 0)
    if (!Number.isSafeInteger(outputBytes))
      throw createError({ statusCode: 400 })
    const connection = await raw
      .prepare(
        'SELECT c.pool_id,s.workspace_id FROM cloud_storage_connections c JOIN platform_sites s ON s.id=c.site_id WHERE c.site_id=? AND c.id=?',
      )
      .bind(lease.siteId, lease.connectionId)
      .first<{ pool_id: string | null; workspace_id: number }>()
    if (connection?.pool_id) {
      const plan = await workspaceEntitlements(
        raw,
        connection.workspace_id,
        'platform',
      )
      const expression = workspaceUsageSQL(lease.siteId)
      const reservation = await raw
        .prepare(`UPDATE cloud_processing_jobs SET reserved_output_bytes=? WHERE site_id=? AND id=? AND attempt_id=? AND state='running' AND lease_until>?
        AND ${expression.storage}-reserved_output_bytes+?<=? RETURNING id`)
        .bind(
          outputBytes,
          lease.siteId,
          lease.id,
          lease.attemptId,
          now,
          now,
          outputBytes,
          plan.limits.storageBytes,
        )
        .first()
      if (!reservation)
        throw createError({
          statusCode: 429,
          statusMessage: 'Storage quota exceeded',
        })
    }
    const outputs = []
    for (const asset of body.assets as {
      role: string
      bytes: number
      contentType: string
    }[]) {
      let name: string
      if (asset.role === 'thumbnail' && asset.contentType === 'image/webp')
        name = 'thumbnail.webp'
      else if (asset.role === 'display' && asset.contentType === 'image/jpeg')
        name = 'display.jpeg'
      else if (asset.role === 'live-video' && asset.contentType === 'video/mp4')
        name = 'live-video.mp4'
      else if (
        asset.role === 'live-video' &&
        asset.contentType === 'video/quicktime'
      )
        name = 'live-video.mov'
      else throw createError({ statusCode: 400 })
      const objectKey = `chronoframe/${lease.siteId}/derived/${lease.photoId}/${lease.sourceVersion}/${lease.pipelineVersion}/${lease.attemptId}/${name}`
      outputs.push({
        ...asset,
        objectKey,
        url: await s3.signPut(objectKey, asset.bytes, asset.contentType),
      })
    }
    return { outputs }
  }
  if (action === 'complete') {
    if (!(await queue.heartbeat(lease, now, 120000))) return { ok: false }
    const result = body.result as CloudMediaResult
    const budget = await raw
      .prepare(
        `SELECT j.reserved_output_bytes,c.pool_id FROM cloud_processing_jobs j JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id JOIN cloud_storage_connections c ON c.site_id=u.site_id AND c.id=u.connection_id WHERE j.site_id=? AND j.id=? AND j.attempt_id=?`,
      )
      .bind(lease.siteId, lease.id, lease.attemptId)
      .first<{ reserved_output_bytes: number; pool_id: string | null }>()
    if (
      budget?.pool_id &&
      (!Array.isArray(result?.assets) ||
        result.assets.some(
          (a) => !Number.isSafeInteger(a.bytes) || a.bytes < 1,
        ) ||
        result.assets.reduce((n, a) => n + a.bytes, 0) >
          budget.reserved_output_bytes)
    )
      throw createError({ statusCode: 409 })
    if (!result || !Array.isArray(result.assets))
      throw createError({ statusCode: 400 })
    const canonical = await raw
      .prepare(
        'SELECT j.photo_id,j.source_version,j.pipeline_version,u.connection_id,u.connection_revision FROM cloud_processing_jobs j JOIN cloud_uploads u ON u.site_id=j.site_id AND u.id=j.upload_id WHERE j.site_id=? AND j.id=? AND j.attempt_id=?',
      )
      .bind(lease.siteId, lease.id, lease.attemptId)
      .first<{
        photo_id: string
        source_version: string
        pipeline_version: string
        connection_id: string
        connection_revision: number
      }>()
    if (
      !canonical ||
      canonical.photo_id !== lease.photoId ||
      canonical.source_version !== lease.sourceVersion ||
      canonical.pipeline_version !== lease.pipelineVersion ||
      canonical.connection_id !== lease.connectionId ||
      canonical.connection_revision !== lease.connectionRevision
    )
      throw createError({ statusCode: 403 })
    const prefix = `chronoframe/${lease.siteId}/derived/${lease.photoId}/${lease.sourceVersion}/${lease.pipelineVersion}/${lease.attemptId}/`
    if (
      result.assets.length < 1 ||
      result.assets.length > 3 ||
      result.assets.some(
        (a) =>
          ![
            'thumbnail.webp',
            'display.jpeg',
            'live-video.mp4',
            'live-video.mov',
          ].some((name) => a.objectKey === prefix + name),
      )
    )
      throw createError({ statusCode: 400 })
    const s3 = await storage(
      lease.siteId,
      lease.connectionId,
      lease.connectionRevision,
    )
    for (const asset of result.assets) {
      const meta = await s3.head(asset.objectKey)
      if (meta.bytes !== asset.bytes || meta.contentType !== asset.contentType)
        throw createError({ statusCode: 400 })
    }
    return { ok: await queue.complete(lease, result, now) }
  }
  throw createError({ statusCode: 404 })
})
