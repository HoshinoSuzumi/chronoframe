import {
  workspaceEntitlements,
  workspaceUsageSQL,
} from '@chronoframe/platform/entitlements'
import { DomainError } from '@chronoframe/platform/domains'
import { defaultSiteHost, validSiteSlug } from '@chronoframe/contracts/domains'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import { createCloudAlbumWithSlug } from '@chronoframe/database/cloud-album-slugs'
import { deleteCloudPhotos } from '../../../../utils/cloud-photo-delete'
import { updateCloudAlbum } from '../../../../utils/cloud-album-editor'
import { getRouterParam, createError } from 'h3'
import { definePlatformHandler } from '../../../../../../shared/platform/runtime'
import { cloudMedia, checkStorage } from '../../../../utils/cloud-media'
import { siteManagementBody } from '../../../../utils/site-management'
import { createResourceReader } from '@chronoframe/core'
import { visitorPasswordHash } from '../../../../../../shared/platform/crypto'

const types: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  gif: 'image/gif',
}
const text = (v: unknown, max = 128) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw createError({ statusCode: 400 })
  return v.trim()
}
const number = (v: unknown) => {
  if (!Number.isSafeInteger(v) || Number(v) < 1)
    throw createError({ statusCode: 400 })
  return Number(v)
}
const ID = (v: unknown) => {
  const s = text(v)
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) throw createError({ statusCode: 400 })
  return s
}
export default definePlatformHandler(async (event) => {
  // The Cloudflare Nitro adapter forwards bodies for POST/PUT/PATCH only.
  // Management mutations use explicit POST actions, not body-bearing DELETE.
  if (!['GET', 'POST', 'PATCH'].includes(event.method))
    throw createError({ statusCode: 405 })
  const mutation = event.method !== 'GET',
    ctx = await cloudMedia(event, mutation)
  const { siteId, userId, site, db, raw, sql, repository, vault } = ctx
  const operation = getRouterParam(event, 'operation') ?? ''
  const [kind, id, action] = operation.split('/')
  const body = mutation ? await siteManagementBody(event, 131072) : {}
  const now = Date.now()
  if (
    kind === 'storage' &&
    id &&
    ['select', 'remove'].includes(action ?? '') &&
    event.method === 'POST'
  ) {
    const target = (await vault.list()).find((c) => c.id === ID(id))
    if (!target) throw createError({ statusCode: 404 })
    if (action === 'remove') {
      if (target.pool_id) throw createError({ statusCode: 403 })
      await raw.batch([
        raw
          .prepare(
            'UPDATE cloud_storage_connections SET retired=1 WHERE site_id=? AND id=?',
          )
          .bind(siteId, id),
        raw
          .prepare(
            'UPDATE platform_sites SET preferred_storage_id=NULL WHERE id=? AND preferred_storage_id=?',
          )
          .bind(siteId, id),
      ])
    } else {
      if (
        !target.uploads_enabled ||
        (!target.pool_id &&
          !(await workspaceEntitlements(raw, site.workspaceId, 'byos')).limits
            .byos)
      )
        throw createError({ statusCode: 403 })
      const selected = await raw
        .prepare(
          'UPDATE platform_sites SET preferred_storage_id=? WHERE id=? AND EXISTS(SELECT 1 FROM cloud_storage_connections WHERE site_id=? AND id=? AND retired=0)',
        )
        .bind(id, siteId, siteId, id)
        .run()
      if (!selected.meta.changes) throw createError({ statusCode: 409 })
    }
    return { ok: true }
  }
  if (kind === 'storage' && !id) {
    if (event.method === 'GET') {
      const available = await raw
        .prepare(
          'SELECT id,name FROM platform_storage_pools WHERE enabled=1 ORDER BY id LIMIT 1',
        )
        .first<{ id: string; name: string }>()
      const plan = await workspaceEntitlements(
        raw,
        site.workspaceId,
        'platform',
      )
      let connections = await vault.list()
      if (available && !connections.some((c) => c.pool_id === available.id)) {
        await vault.attachPool(available.id, now)
        connections = await vault.list()
      }
      return {
        connections,
        preferredConnectionId: (
          await raw
            .prepare(
              'SELECT preferred_storage_id FROM platform_sites WHERE id=?',
            )
            .bind(siteId)
            .first<{ preferred_storage_id: string | null }>()
        )?.preferred_storage_id,
        platformAvailable: !!available,
        plan,
      }
    }
    if (event.method !== 'POST') throw createError({ statusCode: 405 })
    if (
      !(await workspaceEntitlements(raw, site.workspaceId, 'byos')).limits.byos
    )
      throw createError({
        statusCode: 403,
        statusMessage: 'Your plan does not include custom storage',
      })
    if ((await vault.list()).filter((c) => c.retired !== 1).length >= 20)
      throw createError({ statusCode: 429 })
    const config = {
      endpoint: text(body.endpoint, 512),
      region: text(body.region, 40),
      bucket: text(body.bucket, 63),
      accessKeyId: text(body.accessKeyId, 256),
      secretAccessKey: text(body.secretAccessKey, 256),
    }
    await checkStorage(
      config,
      useRuntimeConfig(event).platform.portalOrigin,
      ctx.allowedHosts,
    )
    const connectionId = crypto.randomUUID(),
      { accessKeyId, secretAccessKey, ...publicConfig } = config
    await vault.create(
      connectionId,
      publicConfig,
      { accessKeyId, secretAccessKey },
      now,
    )
    return { id: connectionId, revision: 1 }
  }
  if (
    kind === 'storage' &&
    id &&
    action === 'rotate' &&
    event.method === 'POST'
  ) {
    const old = await vault.get(ID(id))
    if (!old) throw createError({ statusCode: 404 })
    if ('poolId' in old) throw createError({ statusCode: 403 })
    const credentials = {
      accessKeyId: text(body.accessKeyId, 256),
      secretAccessKey: text(body.secretAccessKey, 256),
    }
    await checkStorage(
      { ...old.config, ...credentials },
      useRuntimeConfig(event).platform.portalOrigin,
      ctx.allowedHosts,
    )
    if (!(await vault.rotate(id, number(body.revision), credentials, now)))
      throw createError({ statusCode: 409 })
    return { ok: true }
  }
  if (kind === 'usage' && event.method === 'GET') {
    const plan = await workspaceEntitlements(raw, site.workspaceId, 'platform')
    const expression = workspaceUsageSQL(siteId)
    const storageUsage = await raw
      .prepare(`SELECT ${expression.storage} AS bytes`)
      .bind(now)
      .first<{ bytes: number }>()
    const usage = (
      await sql<{ photos: number; pending: number; bytes: number }>(
        `SELECT (SELECT COUNT(*) FROM cloud_photos WHERE site_id IN(SELECT id FROM platform_sites WHERE workspace_id=?) AND deleted=0) AS photos,(SELECT COUNT(*) FROM cloud_uploads WHERE site_id IN(SELECT id FROM platform_sites WHERE workspace_id=?) AND state='pending' AND expires_at>?) AS pending,COALESCE((SELECT SUM(bytes) FROM cloud_usage_events WHERE site_id IN(SELECT id FROM platform_sites WHERE workspace_id=?) AND created_at>=?),0) AS bytes`,
        site.workspaceId,
        site.workspaceId,
        now,
        site.workspaceId,
        plan.quotaPeriod.start,
      )
    )[0]
    return {
      usage,
      limits: plan.limits,
      byosLimits: (await workspaceEntitlements(raw, site.workspaceId, 'byos'))
        .limits,
      plan: { id: plan.id, name: plan.name },
      quotaPeriod: plan.quotaPeriod,
      subscription: plan.subscription,
      storageBytes: storageUsage?.bytes ?? 0,
    }
  }
  if (kind === 'uploads' && !id && event.method === 'POST') {
    const uploadId = ID(body.requestId),
      connectionId = ID(body.connectionId),
      bytes = number(body.bytes),
      fileName = text(body.fileName, 255)
    const liveVideo = body.liveVideo as
      | { fileName?: unknown; bytes?: unknown }
      | undefined
    const videoBytes = liveVideo ? number(liveVideo.bytes) : 0
    if (
      liveVideo &&
      (typeof liveVideo.fileName !== 'string' ||
        !liveVideo.fileName.toLowerCase().endsWith('.mov') ||
        liveVideo.fileName.replace(/\.[^.]+$/, '').toLowerCase() !==
          fileName.replace(/\.[^.]+$/, '').toLowerCase())
    )
      throw createError({ statusCode: 400 })
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '',
      contentType = types[ext]
    if (
      (await vault.list()).find((c) => c.id === connectionId)
        ?.uploads_enabled === 0
    )
      throw createError({
        statusCode: 409,
        statusMessage: 'Storage is unavailable for uploads',
      })
    const storedConnection = await vault.get(connectionId)
    if (!storedConnection) throw createError({ statusCode: 404 })
    const managed = 'poolId' in storedConnection
    const entitlement = await workspaceEntitlements(
      raw,
      site.workspaceId,
      managed ? 'platform' : 'byos',
    )
    if (!managed && !entitlement.limits.byos)
      throw createError({
        statusCode: 403,
        statusMessage: 'Your plan does not include custom storage',
      })
    if (managed && !storedConnection.enabled)
      throw createError({
        statusCode: 503,
        statusMessage: 'Platform uploads temporarily unavailable',
      })
    if (!contentType || bytes + videoBytes > entitlement.limits.fileBytes)
      throw createError({ statusCode: 400 })
    let upload = await repository.upload(uploadId, userId)
    if (!upload) {
      const stored = storedConnection
      const expression = workspaceUsageSQL(siteId)
      const objectKey = `chronoframe/${siteId}/originals/${uploadId}/1/source.${ext}`
      await db.batch([
        db
          .prepare(`INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,connection_revision,object_key,expected_bytes,expires_at,content_type,file_name,expected_video_bytes,video_key,reserved_storage_bytes)
     SELECT ?,?,?,?,'1',?,?,?,?,?,?,?,?,?,? WHERE
     ${expression.photos}<? AND ${expression.monthly}+?<=? AND (?=0 OR ${expression.storage}+?<=?)
     ON CONFLICT DO NOTHING`)
          .bind(
            siteId,
            uploadId,
            userId,
            uploadId,
            connectionId,
            stored.revision,
            objectKey,
            bytes,
            now + 86400000,
            contentType,
            fileName,
            videoBytes,
            liveVideo
              ? `chronoframe/${siteId}/originals/${uploadId}/1/source.MOV`
              : null,
            managed ? bytes + videoBytes : 0,
            now,
            entitlement.limits.photos,
            entitlement.quotaPeriod.start,
            now,
            bytes + videoBytes,
            entitlement.limits.monthlyBytes,
            managed ? 1 : 0,
            now,
            bytes + videoBytes,
            entitlement.limits.storageBytes,
          ),
      ])
      upload = await repository.upload(uploadId, userId)
    }
    if (!upload) throw createError({ statusCode: 429 })
    if (
      upload.expected_bytes !== bytes ||
      upload.expected_video_bytes !== videoBytes ||
      upload.connection_id !== connectionId
    )
      throw createError({ statusCode: 409 })
    return { id: uploadId }
  }
  if (kind === 'uploads' && id) {
    const upload = await repository.upload(ID(id), userId)
    if (!upload) throw createError({ statusCode: 404 })
    const detail = (
      await sql<{
        connection_revision: number
        content_type: string
        file_name: string
        expected_video_bytes: number
        video_key: string | null
      }>(
        'SELECT connection_revision,content_type,file_name,expected_video_bytes,video_key FROM cloud_uploads WHERE site_id=? AND id=?',
        siteId,
        id,
      )
    )[0]!
    const { s3 } = await ctx.storage(
      upload.connection_id,
      detail.connection_revision,
    )
    if (event.method === 'GET')
      return { state: upload.state, expired: upload.expires_at <= now }
    if (event.method === 'POST' && action === 'plan') {
      if (upload.state !== 'pending' || upload.expires_at <= now)
        return { state: upload.state, expired: upload.expires_at <= now }

      const videoUrl = detail.video_key
        ? await s3.signPut(
            detail.video_key,
            detail.expected_video_bytes,
            'video/quicktime',
          )
        : null
      if (upload.expected_bytes <= 10485760)
        return {
          state: 'pending',
          mode: 'single',
          videoUrl,
          url: await s3.signPut(
            upload.object_key,
            upload.expected_bytes,
            detail.content_type,
          ),
          contentType: detail.content_type,
        }
      let providerId = upload.provider_upload_id
      if (!providerId) {
        const token = crypto.randomUUID()
        const lock = await raw
          .prepare(
            `UPDATE cloud_uploads SET transport_token=?,transport_lease_until=? WHERE site_id=? AND id=? AND state='pending' AND provider_upload_id IS NULL AND (transport_lease_until IS NULL OR transport_lease_until<=?) RETURNING id`,
          )
          .bind(token, now + 30000, siteId, id, now)
          .first()
        if (!lock) throw createError({ statusCode: 409 })
        const recovered = await s3.recoverMultipart(upload.object_key)
        providerId =
          recovered[0] ??
          (await s3.multipart(upload.object_key, detail.content_type))
        for (const abandoned of recovered.slice(1))
          await s3.abort(upload.object_key, abandoned)
        const updated = await raw
          .prepare(
            `UPDATE cloud_uploads SET provider_upload_id=?,transport_token=NULL,transport_lease_until=NULL WHERE site_id=? AND id=? AND transport_token=? AND state='pending' RETURNING id`,
          )
          .bind(providerId, siteId, id, token)
          .first()
        if (!updated) {
          await s3.abort(upload.object_key, providerId)
          throw createError({ statusCode: 409 })
        }
      }
      const parts = await s3.parts(upload.object_key, providerId),
        count = Math.ceil(upload.expected_bytes / 10485760)
      const urls = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          s3.signPart(
            upload.object_key,
            providerId!,
            i + 1,
            Math.min(10485760, upload.expected_bytes - i * 10485760),
          ),
        ),
      )
      return {
        state: 'pending',
        mode: 'multipart',
        videoUrl,
        partBytes: 10485760,
        parts,
        urls,
      }
    }
    if (event.method === 'POST' && action === 'cancel') {
      if (upload.state !== 'pending') throw createError({ statusCode: 409 })
      const changes = await raw.batch([
        raw
          .prepare(
            `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'upload-'||id,connection_id,connection_revision,object_key,provider_upload_id,? FROM cloud_uploads WHERE site_id=? AND id=? AND owner_id=? AND state='pending' ON CONFLICT DO NOTHING`,
          )
          .bind(now + 360000, siteId, id, userId),
        raw
          .prepare(
            `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,available_at) SELECT site_id,'upload-video-'||id,connection_id,connection_revision,video_key,? FROM cloud_uploads WHERE site_id=? AND id=? AND owner_id=? AND state='pending' AND video_key IS NOT NULL ON CONFLICT DO NOTHING`,
          )
          .bind(now + 360000, siteId, id, userId),
        raw
          .prepare(
            `UPDATE cloud_uploads SET state='cancelled' WHERE site_id=? AND id=? AND owner_id=? AND state='pending'`,
          )
          .bind(siteId, id, userId),
      ])
      if (!(changes[2] as { meta?: { changes?: number } }).meta?.changes)
        throw createError({ statusCode: 409 })
      return { ok: true }
    }
    if (event.method === 'POST' && action === 'complete') {
      if (upload.state === 'completed') return { jobId: id }
      if (upload.state !== 'pending' || upload.expires_at <= now)
        throw createError({ statusCode: 409 })
      if (upload.provider_upload_id) {
        // After a lost completion response, an already-created exact-size object is
        // authoritative. Otherwise recover provider parts and complete once more.
        const existing = await s3.head(upload.object_key).catch(() => null)
        if (!existing) {
          const parts = await s3.parts(
            upload.object_key,
            upload.provider_upload_id,
          )
          const expected = Math.ceil(upload.expected_bytes / 10485760)
          if (
            parts.length !== expected ||
            parts.some(
              (p, i) =>
                p.partNumber !== i + 1 ||
                p.bytes !==
                  (i === expected - 1
                    ? upload.expected_bytes - i * 10485760
                    : 10485760),
            )
          )
            throw createError({ statusCode: 409 })
          await s3.finish(upload.object_key, upload.provider_upload_id, parts)
        }
      }
      const head = await s3.head(upload.object_key)
      if (
        head.bytes !== upload.expected_bytes ||
        head.contentType !== detail.content_type
      )
        throw createError({ statusCode: 400 })
      let videoEtag: string | null = null
      if (detail.video_key) {
        const video = await s3.head(detail.video_key)
        if (
          video.bytes !== detail.expected_video_bytes ||
          video.contentType !== 'video/quicktime'
        )
          throw createError({ statusCode: 400 })
        videoEtag = video.etag
      }
      await raw
        .prepare(
          "UPDATE cloud_uploads SET video_etag=?,verified_etag=? WHERE site_id=? AND id=? AND state='pending'",
        )
        .bind(videoEtag, head.etag, siteId, id)
        .run()
      await repository.completeUpload({
        id,
        ownerId: userId,
        jobId: id,
        pipelineVersion: '1',
        title: detail.file_name,
        now,
      })
      return { jobId: id }
    }
  }
  if (
    kind === 'photos' &&
    id === 'reactions' &&
    !action &&
    event.method === 'GET'
  ) {
    const counts = await sql<{ photo_id: string; total: number }>(
      'SELECT r.photo_id, COUNT(*) AS total FROM platform_photo_reactions r JOIN cloud_photos p ON p.site_id=r.site_id AND p.id=r.photo_id WHERE r.site_id=? AND p.deleted=0 GROUP BY r.photo_id',
      siteId,
    )
    return Object.fromEntries(counts.map((row) => [row.photo_id, row.total]))
  }
  if (kind === 'photos' && !id && event.method === 'GET')
    return {
      photos: await ctx.resources.listPhotos(),
      jobs: await sql(
        'SELECT id,state,attempts,error_code,photo_id FROM cloud_processing_jobs WHERE site_id=? ORDER BY created_at DESC LIMIT 100',
        siteId,
      ),
    }
  if (kind === 'photos' && id && event.method === 'GET') {
    const photo = (await ctx.resources.listPhotos()).find(
      (p) => p.id === ID(id),
    )
    const revision = await raw
      .prepare(
        'SELECT revision FROM cloud_photos WHERE site_id=? AND id=? AND deleted=0',
      )
      .bind(siteId, id)
      .first<{ revision: number }>()
    if (!photo || !revision) throw createError({ statusCode: 404 })
    return { photo, revision: revision.revision }
  }
  if (kind === 'photos' && id && event.method === 'PATCH') {
    const title = text(body.title, 255),
      revision = number(body.revision)
    const row = await raw
      .prepare(
        'SELECT metadata_json FROM cloud_photos WHERE site_id=? AND id=? AND revision=? AND deleted=0 AND metadata_json IS NOT NULL',
      )
      .bind(siteId, ID(id), revision)
      .first<{ metadata_json: string }>()
    if (!row) throw createError({ statusCode: 409 })
    const metadata = JSON.parse(row.metadata_json)
    if (body.description !== undefined) {
      if (
        body.description !== null &&
        (typeof body.description !== 'string' || body.description.length > 2048)
      )
        throw createError({ statusCode: 400 })
      metadata.description = body.description || null
    }
    if (body.tags !== undefined) {
      if (
        !Array.isArray(body.tags) ||
        body.tags.length > 32 ||
        body.tags.some((t) => typeof t !== 'string' || t.length > 64)
      )
        throw createError({ statusCode: 400 })
      metadata.tags = body.tags
    }
    if (body.rating !== undefined) {
      if (
        body.rating !== null &&
        (!Number.isInteger(body.rating) ||
          Number(body.rating) < 1 ||
          Number(body.rating) > 5)
      )
        throw createError({ statusCode: 400 })
      metadata.exif = { ...metadata.exif }
      if (body.rating === null) delete metadata.exif.Rating
      else metadata.exif.Rating = body.rating
    }
    const changed = await raw
      .prepare(
        'UPDATE cloud_photos SET title=?,metadata_json=?,revision=revision+1 WHERE site_id=? AND id=? AND revision=? AND deleted=0 RETURNING id',
      )
      .bind(title, JSON.stringify(metadata), siteId, ID(id), revision)
      .first()
    if (!changed) throw createError({ statusCode: 409 })
    return { revision: revision + 1 }
  }
  if (
    kind === 'photos' &&
    id &&
    event.method === 'POST' &&
    action === 'delete'
  ) {
    return deleteCloudPhotos(raw, siteId, [ID(id)], now)
  }
  if (kind === 'photos' && id === 'delete-batch' && event.method === 'POST')
    return deleteCloudPhotos(raw, siteId, body.photoIds, now)
  if (kind === 'jobs' && id && action === 'retry' && event.method === 'POST') {
    const changed = await raw
      .prepare(
        `UPDATE cloud_processing_jobs SET state='queued',available_at=?,max_attempts=attempts+3,error_code=NULL WHERE site_id=? AND id=? AND state='failed' AND attempts<=6 AND EXISTS(SELECT 1 FROM cloud_photos WHERE site_id=? AND id=cloud_processing_jobs.photo_id AND deleted=0) RETURNING id`,
      )
      .bind(now, siteId, ID(id), siteId)
      .first()
    if (!changed) throw createError({ statusCode: 409 })
    return { ok: true }
  }
  if (kind === 'albums' && !id) {
    if (event.method === 'GET')
      return {
        albums: await createResourceReader(ctx.resources).listAlbums({
          admin: true,
        }),
      }
    if (event.method === 'POST') {
      const albumId = String(number(body.id))
      const title = text(body.title, 80)
      const slug = await createCloudAlbumWithSlug(
        raw as unknown as MediaDatabase,
        siteId,
        albumId,
        title,
        { hidden: body.isHidden === true, slug: body.slug },
      )
      return { id: Number(albumId), slug }
    }
  }
  if (
    kind === 'albums' &&
    id &&
    event.method === 'POST' &&
    ['delete', 'remove-photo'].includes(action ?? '')
  ) {
    const albumId = String(number(Number(id)))
    if (!(await repository.album(albumId)))
      throw createError({ statusCode: 404 })
    if (action === 'remove-photo') {
      await raw.batch([
        raw
          .prepare(
            'DELETE FROM cloud_album_photos WHERE site_id=? AND album_id=? AND photo_id=?',
          )
          .bind(siteId, albumId, ID(body.photoId)),
        raw
          .prepare(
            'UPDATE cloud_albums SET cover_photo_id=CASE WHEN cover_photo_id=? THEN NULL ELSE cover_photo_id END,revision=revision+1,updated_at=? WHERE site_id=? AND id=?',
          )
          .bind(ID(body.photoId), now, siteId, albumId),
      ])
    } else if (action === 'delete') {
      await raw.batch([
        raw
          .prepare(
            'DELETE FROM platform_album_access WHERE site_id=? AND album_id=?',
          )
          .bind(siteId, Number(albumId)),
        raw
          .prepare(
            'DELETE FROM cloud_album_photos WHERE site_id=? AND album_id=?',
          )
          .bind(siteId, albumId),
        raw
          .prepare(
            'UPDATE cloud_album_slugs SET album_id=NULL,is_current=0 WHERE site_id=? AND album_id=?',
          )
          .bind(siteId, albumId),
        raw
          .prepare('DELETE FROM cloud_albums WHERE site_id=? AND id=?')
          .bind(siteId, albumId),
      ])
    } else throw createError({ statusCode: 404 })
    return { ok: true }
  }
  if (
    kind === 'albums' &&
    id &&
    action === 'settings' &&
    event.method === 'GET'
  ) {
    const album = await ctx.resources.getAlbum(number(Number(id)))
    const revision = await raw
      .prepare('SELECT revision FROM cloud_albums WHERE site_id=? AND id=?')
      .bind(siteId, id)
      .first<{ revision: number }>()
    if (!album || !revision) throw createError({ statusCode: 404 })
    return {
      album: {
        ...album.resource,
        photos: await ctx.resources.listAlbumPhotos(number(Number(id))),
      },
      revision: revision.revision,
    }
  }
  if (
    kind === 'albums' &&
    id &&
    action === 'settings' &&
    event.method === 'PATCH'
  ) {
    return updateCloudAlbum(raw, siteId, number(Number(id)), body)
  }
  if (kind === 'albums' && id === 'reorder' && event.method === 'POST') {
    if (
      !Array.isArray(body.albumIds) ||
      body.albumIds.length > 100 ||
      body.albumIds.some((v) => !Number.isSafeInteger(v) || Number(v) < 1) ||
      new Set(body.albumIds).size !== body.albumIds.length
    )
      throw createError({ statusCode: 400 })
    const rows = await sql<{ id: string }>(
      'SELECT id FROM cloud_albums WHERE site_id=?',
      siteId,
    )
    if (
      rows.length !== body.albumIds.length ||
      rows.some((row) => !(body.albumIds as number[]).includes(Number(row.id)))
    )
      throw createError({ statusCode: 409 })
    await raw.batch(
      body.albumIds.map((album, index) =>
        raw
          .prepare(
            'UPDATE cloud_albums SET position=? WHERE site_id=? AND id=?',
          )
          .bind(index, siteId, String(album)),
      ),
    )
    return { ok: true }
  }
  if (kind === 'albums' && id && event.method === 'POST') {
    const albumId = String(number(Number(id))),
      album = await repository.album(albumId)
    if (!album) throw createError({ statusCode: 404 })
    if (action === 'photos') {
      {
        const ids = Array.isArray(body.photoIds)
          ? body.photoIds
          : [ID(body.photoId)]
        if (
          !ids.length ||
          ids.length > 1000 ||
          ids.some(
            (v) => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(v),
          )
        )
          throw createError({ statusCode: 400 })
        const values = JSON.stringify([...new Set(ids)])
        const ready = await raw
          .prepare(
            `SELECT COUNT(*) AS total FROM cloud_photos p WHERE p.site_id=? AND p.id IN (SELECT value FROM json_each(?)) AND p.deleted=0 AND p.metadata_json IS NOT NULL AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=p.site_id AND j.photo_id=p.id AND j.source_version=p.source_version AND j.state='succeeded')`,
          )
          .bind(siteId, values)
          .first<{ total: number }>()
        if (ready?.total !== new Set(ids).size)
          throw createError({ statusCode: 400 })
        await raw.batch([
          raw
            .prepare(
              `INSERT INTO cloud_album_photos(site_id,album_id,photo_id,position) SELECT ?,?,value,CAST(key AS INTEGER)+COALESCE((SELECT MAX(position)+1 FROM cloud_album_photos WHERE site_id=? AND album_id=?),0) FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`,
            )
            .bind(siteId, albumId, siteId, albumId, values),
          raw
            .prepare(
              'UPDATE cloud_albums SET revision=revision+1,updated_at=? WHERE site_id=? AND id=?',
            )
            .bind(now, siteId, albumId),
        ])
      }
      return { ok: true }
    }
    if (action === 'access') {
      const hidden = body.hidden === true,
        password = body.password
      if (
        password !== undefined &&
        password !== null &&
        (typeof password !== 'string' ||
          password.length < 8 ||
          password.length > 256)
      )
        throw createError({ statusCode: 400 })
      const salt = crypto.randomUUID(),
        revision = crypto.randomUUID()
      const statements = [
        db
          .prepare(
            'UPDATE cloud_albums SET hidden=?,updated_at=?,revision=revision+1 WHERE site_id=? AND id=?',
          )
          .bind(hidden ? 1 : 0, now, siteId, albumId),
      ]
      // Omission preserves the existing password and its visitor-grant revision.
      // Null is reserved for the explicit removal action.
      if (password !== undefined)
        statements.push(
          password === null
            ? db
                .prepare(
                  'DELETE FROM platform_album_access WHERE site_id=? AND album_id=?',
                )
                .bind(siteId, Number(albumId))
            : db
                .prepare(
                  `INSERT INTO platform_album_access(site_id,album_id,revision,salt,password_hash) VALUES(?,?,?,?,?) ON CONFLICT(site_id,album_id) DO UPDATE SET revision=excluded.revision,salt=excluded.salt,password_hash=excluded.password_hash`,
                )
                .bind(
                  siteId,
                  Number(albumId),
                  revision,
                  salt,
                  await visitorPasswordHash(password as string, salt),
                ),
        )
      await db.batch(statements)
      return { ok: true }
    }
  }
  if (kind === 'publish' && event.method === 'POST') {
    if (!site.slug) throw createError({ statusCode: 400 })
    const revision = number(body.revision),
      published = body.published === true
    if (
      published &&
      (!validSiteSlug(site.slug) ||
        String(useRuntimeConfig(event).public.defaultDomainsReady) !== 'true')
    )
      throw new DomainError(503, 'domain_routing_unavailable')
    const hostname = validSiteSlug(site.slug)
      ? defaultSiteHost(
          site.slug,
          useRuntimeConfig(event).public.siteBaseDomain,
        )
      : site.slug + '.site.chronoframe.art'
    const changes = await raw.batch([
      raw
        .prepare(
          `INSERT INTO platform_domains(hostname,site_id,verified,active,kind) SELECT ?,id,1,?,'default' FROM platform_sites WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id=platform_sites.workspace_id AND user_id=? AND role='admin') ON CONFLICT(hostname) DO UPDATE SET active=excluded.active WHERE platform_domains.site_id=excluded.site_id`,
        )
        .bind(hostname, published ? 1 : 0, siteId, revision, userId),
      raw
        .prepare(
          `UPDATE platform_sites SET published=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id=platform_sites.workspace_id AND user_id=? AND role='admin') AND (?=0 OR EXISTS(SELECT 1 FROM platform_domains WHERE hostname=? AND site_id=platform_sites.id))`,
        )
        .bind(
          published ? 1 : 0,
          siteId,
          revision,
          userId,
          published ? 1 : 0,
          hostname,
        ),
    ])
    if (changes[1]?.meta.changes !== 1) throw createError({ statusCode: 409 })
    return { published, hostname, revision: revision + 1 }
  }
  throw createError({ statusCode: 404 })
})
