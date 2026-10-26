import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { createCloudS3 } from '@chronoframe/storage/s3-edge'
import { createStorageCipher } from '@chronoframe/storage/credential-cipher'
import { createStorageVault } from '../../../packages/platform/src/index'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import { photoAccessDenied } from '../../../packages/core/src/access'
import { platformDatabase } from './runtime'
import { visitorAccess } from './visitor'
import type { PublicSiteContext } from '../../../packages/core/src/platform'

/** Check album policy on every role: thumbnail, original and Live Photo share it. */
export async function authorizePublicPhoto(
  event: H3Event,
  context: PublicSiteContext,
  id: string,
) {
  const repository = createCloudResourceRepository(
    platformDatabase(event) as unknown as MediaDatabase,
    context.site,
    '/api/public/media',
  )
  const memberships = repository.membershipsForPhoto
    ? await repository.membershipsForPhoto(id)
    : (await repository.listMemberships()).filter((m) => m.photoId === id)
  const grants = new Map<number, boolean>()
  for (const m of memberships)
    if (m.protected && !m.hidden)
      grants.set(
        m.albumId,
        (
          await visitorAccess(
            event,
            context,
            m.albumId,
            useRuntimeConfig(event).platform.secret,
          )
        ).unlocked,
      )
  if (
    photoAccessDenied(
      false,
      memberships.map((m) => ({
        album: {
          id: m.albumId,
          isHidden: m.hidden,
          passwordHash: m.protected ? 'protected' : null,
        },
      })),
      (album) => grants.get(album.id) === true,
    )
  )
    throw createError({ statusCode: 404 })
}
/** Stream authorized objects, keeping signed URLs out of HTML, redirects and caches. */
export async function privateMedia(
  event: H3Event,
  siteId: number,
  photoId: string,
  role: string,
) {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(photoId) ||
    !['original', 'thumbnail', 'live-video', 'display'].includes(role)
  )
    throw createError({ statusCode: 404 })
  const raw = platformDatabase(event)
  const source = await raw
    .prepare(
      `SELECT u.connection_id,u.connection_revision,u.object_key,u.expected_bytes,u.content_type,u.verified_etag FROM cloud_uploads u JOIN cloud_photos p ON p.site_id=u.site_id AND p.id=u.photo_id AND p.source_version=u.source_version WHERE u.site_id=? AND p.id=? AND p.deleted=0 AND p.metadata_json IS NOT NULL AND u.state='completed' AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=p.site_id AND j.photo_id=p.id AND j.source_version=p.source_version AND j.state='succeeded') LIMIT 1`,
    )
    .bind(siteId, photoId)
    .first<{
      connection_id: string
      connection_revision: number
      object_key: string
      expected_bytes: number
      content_type: string
      verified_etag: string | null
    }>()
  if (!source) throw createError({ statusCode: 404 })
  let object = {
    connection_id: source.connection_id,
    connection_revision: source.connection_revision,
    object_key: source.object_key,
    bytes: source.expected_bytes,
    content_type: source.content_type,
  }
  if (role !== 'original') {
    const asset = await raw
      .prepare(
        `SELECT connection_id,connection_revision,object_key,bytes,content_type FROM cloud_media_assets a WHERE site_id=? AND photo_id=? AND role=? AND source_version=(SELECT source_version FROM cloud_photos WHERE site_id=? AND id=?) LIMIT 1`,
      )
      .bind(siteId, photoId, role, siteId, photoId)
      .first<typeof object>()
    if (!asset && role !== 'display') throw createError({ statusCode: 404 })
    if (asset) object = asset
  }
  const config = useRuntimeConfig(event).platform
  const vault = createStorageVault(
    raw,
    siteId,
    await createStorageCipher(config.storageSecret),
  )
  const stored = await vault.resolve(
    object.connection_id,
    object.connection_revision,
  )
  if (!stored) throw createError({ statusCode: 503 })
  const s3 = createCloudS3(
    { ...stored.config, ...stored.credentials },
    {
      allowedHosts: (
        ('poolId' in stored
          ? new URL(stored.config.endpoint).hostname + ','
          : '') + config.s3EndpointHosts
      )
        .split(',')
        .map((v: string) => v.trim())
        .filter(Boolean),
    },
  )
  const range = getHeader(event, 'range')
  if (range && !/^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/.test(range))
    throw createError({ statusCode: 400 })
  const headers: Record<string, string> = {}
  if (range) headers.Range = range
  if (object.object_key === source.object_key && source.verified_etag)
    headers['If-Match'] = source.verified_etag
  const response = await fetch(await s3.signGet(object.object_key), {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw createError({ statusCode: 404 })
  }
  const length = Number(response.headers.get('content-length'))
  if (length > object.bytes) {
    await response.body?.cancel()
    throw createError({ statusCode: 503 })
  }
  const out = new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Type': object.content_type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  })
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name)
    if (value) out.set(name, value)
  }
  return new Response(response.body, { status: response.status, headers: out })
}
