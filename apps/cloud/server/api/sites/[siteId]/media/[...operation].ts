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
  const body = mutation ? await siteManagementBody(event) : {}
  const now = Date.now()
  if (kind === 'storage' && !id) {
    if (event.method === 'GET') return { connections: await vault.list() }
    if (event.method !== 'POST') throw createError({ statusCode: 405 })
    if ((await vault.list()).length >= 20)
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
    const usage = (
      await sql<{ photos: number; pending: number; bytes: number }>(
        `SELECT (SELECT COUNT(*) FROM cloud_photos WHERE site_id=? AND deleted=0) AS photos,(SELECT COUNT(*) FROM cloud_uploads WHERE site_id=? AND state='pending' AND expires_at>?) AS pending,COALESCE((SELECT SUM(bytes) FROM cloud_usage_events WHERE site_id=? AND created_at>?),0) AS bytes`,
        siteId,
        siteId,
        now,
        siteId,
        now - 30 * 86400000,
      )
    )[0]
    return {
      usage,
      limits: { fileBytes: 104857600, photos: 1000, monthlyBytes: 5368709120 },
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
    if (!contentType || bytes + videoBytes > 104857600)
      throw createError({ statusCode: 400 })
    let upload = await repository.upload(uploadId, userId)
    if (!upload) {
      const stored = await vault.get(connectionId)
      if (!stored) throw createError({ statusCode: 404 })
      const objectKey = `chronoframe/${siteId}/originals/${uploadId}/1/source.${ext}`
      await db.batch([
        db
          .prepare(`INSERT INTO cloud_uploads(site_id,id,owner_id,photo_id,source_version,connection_id,connection_revision,object_key,expected_bytes,expires_at,content_type,file_name,expected_video_bytes,video_key)
     SELECT ?,?,?,?,'1',?,?,?,?,?,?,?,?,? WHERE
     (SELECT COUNT(*) FROM cloud_photos WHERE site_id=? AND deleted=0)+(SELECT COUNT(*) FROM cloud_uploads WHERE site_id=? AND state='pending' AND expires_at>?)<1000 AND
     COALESCE((SELECT SUM(bytes) FROM cloud_usage_events WHERE site_id=? AND created_at>?),0)+COALESCE((SELECT SUM(expected_bytes+expected_video_bytes) FROM cloud_uploads WHERE site_id=? AND state='pending' AND expires_at>?),0)+?<=5368709120
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
            siteId,
            siteId,
            now,
            siteId,
            now - 30 * 86400000,
            siteId,
            now,
            bytes + videoBytes,
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
      description =
        body.description === null ? null : text(body.description, 2048),
      revision = number(body.revision)
    const changed = await raw
      .prepare(
        `UPDATE cloud_photos SET title=?,metadata_json=json_set(metadata_json,'$.description',?),revision=revision+1 WHERE site_id=? AND id=? AND revision=? AND deleted=0 AND metadata_json IS NOT NULL RETURNING id`,
      )
      .bind(title, description, siteId, ID(id), revision)
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
    const found = await raw
      .prepare('SELECT id FROM cloud_photos WHERE site_id=? AND id=?')
      .bind(siteId, ID(id))
      .first()
    if (!found) throw createError({ statusCode: 404 })
    await db.batch([
      db
        .prepare('UPDATE cloud_photos SET deleted=1 WHERE site_id=? AND id=?')
        .bind(siteId, id),
      db
        .prepare(
          "UPDATE cloud_processing_jobs SET state='cancelled' WHERE site_id=? AND photo_id=? AND state IN ('queued','running','retry_wait')",
        )
        .bind(siteId, id),
      db
        .prepare(
          `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'original-'||id,connection_id,connection_revision,object_key,NULL,? FROM cloud_uploads WHERE site_id=? AND photo_id=? ON CONFLICT DO NOTHING`,
        )
        .bind(now + 360000, siteId, id),
      db
        .prepare(
          `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'video-'||id,connection_id,connection_revision,video_key,NULL,? FROM cloud_uploads WHERE site_id=? AND photo_id=? AND video_key IS NOT NULL ON CONFLICT DO NOTHING`,
        )
        .bind(now + 360000, siteId, id),
      db
        .prepare(
          `INSERT INTO cloud_cleanup_requests(site_id,id,connection_id,connection_revision,object_key,provider_upload_id,available_at) SELECT site_id,'asset-'||photo_id||'-'||role,connection_id,connection_revision,object_key,NULL,? FROM cloud_media_assets WHERE site_id=? AND photo_id=? ON CONFLICT DO NOTHING`,
        )
        .bind(now + 360000, siteId, id),
    ])
    return { ok: true }
  }
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
      await repository.createAlbum(albumId, text(body.title, 80))
      return { id: Number(albumId) }
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
      await raw
        .prepare(
          'DELETE FROM cloud_album_photos WHERE site_id=? AND album_id=? AND photo_id=?',
        )
        .bind(siteId, albumId, ID(body.photoId))
        .run()
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
    return { album: album.resource, revision: revision.revision }
  }
  if (
    kind === 'albums' &&
    id &&
    action === 'settings' &&
    event.method === 'PATCH'
  ) {
    const revision = number(body.revision),
      title = text(body.title, 80)
    const changed = await raw
      .prepare(
        'UPDATE cloud_albums SET title=?,revision=revision+1,updated_at=? WHERE site_id=? AND id=? AND revision=? RETURNING id',
      )
      .bind(title, now, siteId, String(number(Number(id))), revision)
      .first()
    if (!changed) throw createError({ statusCode: 409 })
    return { revision: revision + 1 }
  }
  if (kind === 'albums' && id && event.method === 'POST') {
    const albumId = String(number(Number(id))),
      album = await repository.album(albumId)
    if (!album) throw createError({ statusCode: 404 })
    if (action === 'photos') {
      await repository.addToAlbum(albumId, ID(body.photoId))
      return { ok: true }
    }
    if (action === 'access') {
      const hidden = body.hidden === true,
        password = body.password
      if (
        password !== null &&
        (typeof password !== 'string' ||
          password.length < 8 ||
          password.length > 256)
      )
        throw createError({ statusCode: 400 })
      const salt = crypto.randomUUID(),
        revision = crypto.randomUUID()
      await db.batch([
        db
          .prepare(
            'UPDATE cloud_albums SET hidden=?,updated_at=? WHERE site_id=? AND id=?',
          )
          .bind(hidden ? 1 : 0, now, siteId, albumId),
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
      ])
      return { ok: true }
    }
  }
  if (kind === 'publish' && event.method === 'POST') {
    if (!site.slug) throw createError({ statusCode: 400 })
    const revision = number(body.revision),
      published = body.published === true
    if (published && !(await ctx.resources.listPhotos()).length)
      throw createError({ statusCode: 400 })
    const hostname = site.slug + '.site.chronoframe.art'
    const changes = await raw.batch([
      raw
        .prepare(
          `INSERT INTO platform_domains(hostname,site_id,verified,active) SELECT ?,id,1,? FROM platform_sites WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id=platform_sites.workspace_id AND user_id=? AND role='admin') ON CONFLICT(hostname) DO UPDATE SET active=excluded.active WHERE platform_domains.site_id=excluded.site_id`,
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
