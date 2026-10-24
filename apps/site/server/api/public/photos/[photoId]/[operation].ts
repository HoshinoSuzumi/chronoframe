import { createError, getRouterParam, getHeader, getRequestWebStream } from 'h3'
import { REACTION_TYPES } from '@chronoframe/contracts/reactions'
import { createResourceReader } from '@chronoframe/core'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import {
  definePlatformHandler,
  platformDatabase,
  platformRequestURL,
} from '../../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../../shared/platform/context'
import { authorizePublicPhoto } from '../../../../../../shared/platform/media'
import { createEmailCodeCrypto } from '../../../../../../shared/platform/crypto'
import { readSiteBody } from '../../../../../../shared/platform/json'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event),
    id = getRouterParam(event, 'photoId') ?? '',
    operation = getRouterParam(event, 'operation')
  const db = platformDatabase(event)
  const photo = await db
    .prepare(
      `SELECT p.id FROM cloud_photos p WHERE p.site_id=? AND p.id=? AND p.deleted=0 AND p.metadata_json IS NOT NULL AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=p.site_id AND j.photo_id=p.id AND j.source_version=p.source_version AND j.state='succeeded')`,
    )
    .bind(context.site.id, id)
    .first()
  if (!photo) throw createError({ statusCode: 404 })
  await authorizePublicPhoto(event, context, id)
  if (operation === 'albums' && event.method === 'GET') {
    const repository = createCloudResourceRepository(
      db as unknown as MediaDatabase,
      context.site,
      '/api/public/media',
    )
    const memberships = await repository.membershipsForPhoto!(id),
      ids = new Set(memberships.map((m) => m.albumId))
    return (
      await createResourceReader(repository).listAlbums({ admin: false })
    ).filter((a) => ids.has(a.id))
  }
  if (
    operation !== 'reactions' ||
    !['GET', 'POST', 'DELETE'].includes(event.method)
  )
    throw createError({ statusCode: 405 })
  const mac = await createEmailCodeCrypto(
      useRuntimeConfig(event).platform.secret,
    ),
    client = getHeader(event, 'cf-connecting-ip') ?? 'unknown'
  const visitor = await mac.mac([
    'gallery-reaction',
    String(context.site.id),
    platformRequestURL(event).hostname,
    client,
    getHeader(event, 'user-agent') ?? 'unknown',
  ])
  if (event.method !== 'GET') {
    if (
      !event.context.cloudflare ||
      client === 'unknown' ||
      getHeader(event, 'origin') !== platformRequestURL(event).origin
    )
      throw createError({ statusCode: 403 })
    const window = Math.floor(Date.now() / 60000)
    const limit = await db
      .prepare(
        `INSERT INTO platform_auth_attempts(key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts`,
      )
      .bind(
        'gallery-reaction:' +
          (await mac.mac([String(context.site.id), client])),
        window,
      )
      .first<{ attempts: number }>()
    if (!limit || limit.attempts > 10) throw createError({ statusCode: 429 })
    if (event.method === 'DELETE')
      await db
        .prepare(
          'DELETE FROM platform_photo_reactions WHERE site_id=? AND photo_id=? AND visitor_key=?',
        )
        .bind(context.site.id, id, visitor)
        .run()
    else {
      const body = await readSiteBody(getRequestWebStream(event))
      const reaction = body?.reactionType
      if (
        typeof reaction !== 'string' ||
        !(REACTION_TYPES as readonly string[]).includes(reaction)
      )
        throw createError({ statusCode: 400 })
      await db
        .prepare(
          'INSERT INTO platform_photo_reactions(site_id,photo_id,visitor_key,reaction_type,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(site_id,photo_id,visitor_key) DO UPDATE SET reaction_type=excluded.reaction_type,updated_at=excluded.updated_at',
        )
        .bind(context.site.id, id, visitor, reaction, Date.now())
        .run()
    }
  }
  const countRow = await db
    .prepare(
      "SELECT COALESCE(json_group_array(json_object('reaction_type',reaction_type,'total',total)),'[]') AS items FROM (SELECT reaction_type,COUNT(*) AS total FROM platform_photo_reactions WHERE site_id=? AND photo_id=? GROUP BY reaction_type)",
    )
    .bind(context.site.id, id)
    .first<{ items: string }>()
  const counts = JSON.parse(countRow?.items ?? '[]') as {
    reaction_type: string
    total: number
  }[]
  const own = await db
    .prepare(
      'SELECT reaction_type FROM platform_photo_reactions WHERE site_id=? AND photo_id=? AND visitor_key=?',
    )
    .bind(context.site.id, id, visitor)
    .first<{ reaction_type: string }>()
  return {
    reactions: Object.fromEntries(
      REACTION_TYPES.map((type) => [
        type,
        counts.find((c) => c.reaction_type === type)?.total ?? 0,
      ]),
    ),
    userReaction: own?.reaction_type ?? null,
  }
})
