import {
  authenticateProcessor,
  processorEnvelope,
} from '../../../../../../packages/platform/src/processors'
import { parseProcessorLimits } from '@chronoframe/contracts/processor'
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
  if (!getHeader(event, 'content-type')?.startsWith('application/json'))
    throw createError({ statusCode: 415 })
  const token = getHeader(event, 'authorization')?.replace(/^Bearer /, '') ?? ''
  const raw = platformDatabase(event),
    db = raw as unknown as MediaDatabase
  const node = await authenticateProcessor(raw, token)
  if (!node) throw createError({ statusCode: 401 })
  const body = await readSiteBody(
      getRequestWebStream(event),
      getRouterParam(event, 'action') === 'complete' ? 786432 : 98304,
    ),
    action = getRouterParam(event, 'action'),
    now = Date.now()
  if (
    ['register', 'status', 'claim'].includes(action ?? '') &&
    (typeof body.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(body.nonce))
  )
    throw createError({ statusCode: 400 })
  const limits = parseProcessorLimits(JSON.parse(node.limits_json))
  if (action === 'register' || action === 'status') {
    const short = (v: unknown, max = 128) =>
      typeof v === 'string'
        ? Array.from(v)
            .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
            .join('')
            .slice(0, max)
        : ''
    const metrics: Record<string, number> = {}
    for (const k of ['cpuCount', 'load1', 'rss', 'totalMemory', 'freeMemory']) {
      const v = (body.metrics as Record<string, unknown> | undefined)?.[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) metrics[k] = v
    }
    await raw
      .prepare(
        'UPDATE platform_processor_nodes SET last_seen_at=?,version=?,instance_id=?,hostname=?,metrics_json=? WHERE id=? AND enabled=1',
      )
      .bind(
        now,
        short(body.version),
        short(body.instanceId),
        short(body.hostname),
        JSON.stringify(metrics),
        node.id,
      )
      .run()
    return processorEnvelope(
      raw,
      config.storageSecret,
      token,
      node,
      now,
      String(body.nonce),
    )
  }
  await raw
    .prepare(
      'UPDATE platform_processor_nodes SET last_seen_at=? WHERE id=? AND enabled=1',
    )
    .bind(now, node.id)
    .run()
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
  if (action === 'geocoding-slot') {
    if (
      typeof body.provider !== 'string' ||
      !['mapbox', 'nominatim'].includes(body.provider)
    )
      throw createError({ statusCode: 400 })
    const interval = body.provider === 'nominatim' ? 1000 : 100
    const result = await raw
      .prepare(
        'INSERT INTO platform_processor_geocoding_slots(provider,next_at) VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET next_at=MAX(next_at,?)+? RETURNING next_at',
      )
      .bind(body.provider, now + interval, now, interval)
      .first<{ next_at: number }>()
    return { delayMs: Math.max(0, result!.next_at - interval - now) }
  }
  if (action === 'claim') {
    const active = await raw
      .prepare(
        "SELECT id FROM cloud_processing_jobs WHERE worker_id=? AND state='running' AND lease_until>? LIMIT 1",
      )
      .bind(node.id, now)
      .first()
    if (active) return { lease: null }
    const candidates = (
      await db
        .prepare(
          `SELECT j.site_id,MIN(j.created_at) oldest FROM cloud_processing_jobs j JOIN platform_sites s ON s.id=j.site_id AND s.suspended=0 LEFT JOIN cloud_site_dispatch d ON d.site_id=j.site_id WHERE ((state IN ('queued','retry_wait') AND available_at<=?) OR (state='running' AND lease_until<=?)) AND j.required_pixels<=? AND j.required_file_bytes<=? AND j.required_metadata_bytes<=? AND EXISTS(SELECT 1 FROM cloud_uploads eligible WHERE eligible.site_id=j.site_id AND eligible.id=j.upload_id AND MAX(eligible.expected_bytes,eligible.expected_video_bytes)<=?) AND NOT EXISTS(SELECT 1 FROM cloud_processing_jobs active WHERE active.site_id=j.site_id AND active.state='running' AND active.lease_until>?) GROUP BY j.site_id ORDER BY COALESCE(d.last_claim_at,0),oldest,j.site_id LIMIT 10`,
        )
        .bind(
          now,
          now,
          limits.maxPixels,
          limits.maxFileBytes,
          limits.maxMetadataBytes,
          limits.maxFileBytes,
          now,
        )
        .all<{ site_id: number }>()
    ).results
    for (const candidate of candidates) {
      const lease = await createCloudExecutionRepository(
        db,
        {
          id: candidate.site_id,
        },
        limits,
      ).claim(node.id, crypto.randomUUID(), now, 120000)
      if (!lease) continue
      // A deletion mark may race the candidate query. Do not issue fresh transport capabilities.
      if (
        !(await raw
          .prepare('SELECT id FROM platform_sites WHERE id=? AND suspended=0')
          .bind(lease.siteId)
          .first())
      )
        continue
      const sanitized = await raw
        .prepare(
          "SELECT object_key,bytes FROM cloud_media_assets WHERE site_id=? AND photo_id=? AND source_version=? AND role='sanitized-original' ORDER BY pipeline_version DESC LIMIT 1",
        )
        .bind(lease.siteId, lease.photoId, lease.sourceVersion)
        .first<{ object_key: string; bytes: number }>()
      if (sanitized) {
        lease.objectKey = sanitized.object_key
        lease.expectedBytes = sanitized.bytes
      }
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
      const attachment = await raw
        .prepare(
          "SELECT u.object_key,u.expected_bytes,u.verified_etag FROM cloud_photo_companions c JOIN cloud_uploads u ON u.site_id=c.site_id AND u.id=c.upload_id WHERE c.site_id=? AND c.photo_id=? AND u.source_version=? AND u.state='completed'",
        )
        .bind(lease.siteId, lease.photoId, lease.sourceVersion)
        .first<{
          object_key: string
          expected_bytes: number
          verified_etag: string | null
        }>()
      if (attachment && detail) {
        detail.video_key = attachment.object_key
        detail.expected_video_bytes = attachment.expected_bytes
        detail.video_etag = attachment.verified_etag
      }
      const options = await raw
        .prepare(
          'SELECT operation,options_json FROM cloud_processing_jobs WHERE site_id=? AND id=?',
        )
        .bind(lease.siteId, lease.id)
        .first<{ operation: string; options_json: string }>()
      return {
        lease,
        sourceUrl: await s3.signGet(lease.objectKey),
        fileName: detail?.file_name,
        contentType: detail?.content_type,
        options,
        priorMetadata: await raw
          .prepare(
            'SELECT metadata_json,title FROM cloud_photos WHERE site_id=? AND id=?',
          )
          .bind(lease.siteId, lease.photoId)
          .first(),
        eraseLocation:
          !!sanitized ||
          (options?.operation === 'photo' &&
            !!(
              await raw
                .prepare(
                  'SELECT erase_location FROM platform_site_processing WHERE site_id=?',
                )
                .bind(lease.siteId)
                .first<{ erase_location: number }>()
            )?.erase_location),
        configuration: await processorEnvelope(
          raw,
          config.storageSecret,
          token,
          node,
          now,
          String(body.nonce),
        ),
        etag: sanitized ? undefined : detail?.verified_etag,
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
    // Retire overwritten derivatives and unsanitized originals only after a replacement is published.
    const obsolete = (
      await db
        .prepare(
          `SELECT a.site_id,a.photo_id,a.pipeline_version,a.role,a.connection_id,a.connection_revision,a.object_key FROM cloud_media_assets a WHERE EXISTS(SELECT 1 FROM cloud_media_assets newer WHERE newer.site_id=a.site_id AND newer.photo_id=a.photo_id AND newer.source_version=a.source_version AND newer.role=a.role AND newer.pipeline_version>a.pipeline_version) LIMIT 20`,
        )
        .all<any>()
    ).results
    for (const asset of obsolete)
      await raw.batch([
        raw
          .prepare(
            'INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
          )
          .bind(
            asset.site_id,
            'obsolete-' +
              asset.photo_id +
              '-' +
              asset.pipeline_version +
              '-' +
              asset.role,
            asset.connection_id,
            asset.connection_revision,
            asset.object_key,
            now + 360000,
          ),
        raw
          .prepare(
            'DELETE FROM cloud_media_assets WHERE site_id=? AND photo_id=? AND pipeline_version=? AND role=? AND object_key=?',
          )
          .bind(
            asset.site_id,
            asset.photo_id,
            asset.pipeline_version,
            asset.role,
            asset.object_key,
          ),
      ])
    const originals = (
      await db
        .prepare(
          `SELECT u.site_id,u.id,u.connection_id,u.connection_revision,u.object_key FROM cloud_uploads u WHERE u.content_type NOT LIKE 'video/%' AND EXISTS(SELECT 1 FROM cloud_media_assets a WHERE a.site_id=u.site_id AND a.photo_id=u.photo_id AND a.source_version=u.source_version AND a.role='sanitized-original') AND NOT EXISTS(SELECT 1 FROM cloud_cleanup_requests c WHERE c.site_id=u.site_id AND c.id='erased-original-'||u.id) LIMIT 20`,
        )
        .all<any>()
    ).results
    for (const original of originals)
      await raw
        .prepare(
          'INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
        )
        .bind(
          original.site_id,
          'erased-original-' + original.id,
          original.connection_id,
          original.connection_revision,
          original.object_key,
          now + 360000,
        )
        .run()

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
        'sanitized-original',
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
  if (lease.workerId !== node.id) throw createError({ statusCode: 403 })
  const jobPolicy = await raw
    .prepare(
      'SELECT options_json FROM cloud_processing_jobs WHERE site_id=? AND id=?',
    )
    .bind(lease.siteId, lease.id)
    .first<{ options_json: string }>()
  const publicationRevision = Number(
    JSON.parse(jobPolicy?.options_json ?? '{}').publicationRevision ?? 0,
  )
  const queue = createCloudExecutionRepository(
    db,
    { id: lease.siteId },
    limits,
    action === 'complete' ? publicationRevision : 0,
  )
  if (action === 'heartbeat')
    return { ok: await queue.heartbeat(lease, now, 120000) }
  if (action === 'fail') {
    const code = typeof body.code === 'string' ? body.code : 'processing_error'
    const ok = await queue.fail(lease, code, body.retryable === true, now)
    if (
      ok &&
      ['node_pixel_limit', 'node_file_limit', 'node_metadata_limit'].includes(
        code,
      )
    ) {
      const pixels = Number(body.requiredPixels ?? 0),
        bytes = Number(body.requiredBytes ?? 0),
        metadata = Number(body.requiredMetadataBytes ?? 0)
      if (
        Number.isSafeInteger(pixels) &&
        pixels >= 0 &&
        Number.isSafeInteger(bytes) &&
        bytes >= 0 &&
        Number.isSafeInteger(metadata) &&
        metadata >= 0 &&
        (pixels > limits.maxPixels ||
          bytes > limits.maxFileBytes ||
          metadata > limits.maxMetadataBytes)
      )
        await raw
          .prepare(
            "UPDATE cloud_processing_jobs SET state='queued',attempts=MAX(0,attempts-1),required_pixels=MAX(required_pixels,?),required_file_bytes=MAX(required_file_bytes,?),required_metadata_bytes=MAX(required_metadata_bytes,?),available_at=? WHERE site_id=? AND id=? AND attempt_id=? AND worker_id=? AND state IN('retry_wait','failed') AND error_code=?",
          )
          .bind(
            pixels,
            bytes,
            metadata,
            now + 3000,
            lease.siteId,
            lease.id,
            lease.attemptId,
            node.id,
            code,
          )
          .run()
    }
    return { ok }
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
      body.assets.length > 4 ||
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
      declared.some(
        (a) =>
          !Number.isSafeInteger(a.bytes) ||
          a.bytes < 1 ||
          a.bytes > limits.maxFileBytes,
      ) ||
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
      else if (
        asset.role === 'sanitized-original' &&
        /^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp|tiff)$/.test(
          asset.contentType,
        )
      )
        name = 'sanitized-original'
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
      result.assets.length > 4 ||
      result.assets.some(
        (a) =>
          ![
            'sanitized-original',
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
    const ok = await queue.complete(lease, result, now)
    if (!ok)
      await createCloudExecutionRepository(
        db,
        { id: lease.siteId },
        limits,
      ).fail(lease, 'photo_changed', false, now)
    return { ok }
  }
  throw createError({ statusCode: 404 })
})
