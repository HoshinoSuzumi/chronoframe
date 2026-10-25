import { CoreError } from '@chronoframe/core'
import {
  cloudAlbumSlugConflict,
  prepareCloudAlbumSlug,
} from '@chronoframe/database/cloud-album-slugs'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import { createError } from 'h3'
import type { platformDatabase } from '../../../shared/platform/runtime'
type CloudDatabase = ReturnType<typeof platformDatabase>
import { visitorPasswordHash } from '../../../shared/platform/crypto.ts'
/** Conditional child writes precede the revision bump in one D1 batch. A stale
 * editor therefore cannot replace membership or password state before a 409. */
export async function updateCloudAlbum(
  db: CloudDatabase,
  siteId: number,
  id: number,
  body: Record<string, unknown>,
  slugAttempt = 0,
): Promise<{ revision: number }> {
  const revision = body.revision,
    title = body.title
  if (
    !Number.isSafeInteger(revision) ||
    Number(revision) < 1 ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 80
  )
    throw createError({ statusCode: 400 })
  const description = body.description
  if (
    description !== undefined &&
    description !== null &&
    (typeof description !== 'string' || description.length > 2048)
  )
    throw createError({ statusCode: 400 })
  const ids = body.photoIds
  if (
    ids !== undefined &&
    (!Array.isArray(ids) ||
      ids.length > 1000 ||
      ids.some(
        (v) => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(v),
      ) ||
      new Set(ids).size !== ids.length)
  )
    throw createError({ statusCode: 400 })
  const photoIds = ids as string[] | undefined
  if (photoIds?.length) {
    const result = await db
      .prepare(
        `SELECT COUNT(*) AS total FROM cloud_photos p WHERE site_id=? AND id IN (SELECT value FROM json_each(?)) AND deleted=0 AND metadata_json IS NOT NULL AND EXISTS(SELECT 1 FROM cloud_processing_jobs j WHERE j.site_id=p.site_id AND j.photo_id=p.id AND j.source_version=p.source_version AND j.state='succeeded')`,
      )
      .bind(siteId, JSON.stringify(photoIds))
      .first<{ total: number }>()
    if (result?.total !== photoIds.length)
      throw createError({ statusCode: 400 })
  }
  const cover = body.coverPhotoId
  if (
    cover !== undefined &&
    cover !== null &&
    (typeof cover !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(cover))
  )
    throw createError({ statusCode: 400 })
  if (typeof cover === 'string') {
    if (photoIds && !photoIds.includes(cover))
      throw createError({ statusCode: 400 })
    if (
      !photoIds &&
      !(await db
        .prepare(
          'SELECT 1 FROM cloud_album_photos WHERE site_id=? AND album_id=? AND photo_id=?',
        )
        .bind(siteId, String(id), cover)
        .first())
    )
      throw createError({ statusCode: 400 })
  }
  if (body.isHidden !== undefined && typeof body.isHidden !== 'boolean')
    throw createError({ statusCode: 400 })
  const password = body.password
  if (
    password !== undefined &&
    password !== null &&
    (typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 256)
  )
    throw createError({ statusCode: 400 })
  const guard =
    'EXISTS(SELECT 1 FROM cloud_albums WHERE site_id=? AND id=? AND revision=?)'
  const args = [siteId, String(id), Number(revision)]
  const claim = await prepareCloudAlbumSlug(
    db as unknown as MediaDatabase,
    siteId,
    String(id),
    title.trim(),
    body.slug,
    guard,
    args,
  )
  const statements = [...claim.statements]
  if (photoIds) {
    statements.push(
      db
        .prepare(
          `DELETE FROM cloud_album_photos WHERE site_id=? AND album_id=? AND ${guard}`,
        )
        .bind(siteId, String(id), ...args),
    )
    statements.push(
      db
        .prepare(
          `INSERT INTO cloud_album_photos(site_id,album_id,photo_id,position) SELECT ?,?,value,CAST(key AS INTEGER) FROM json_each(?) WHERE ${guard}`,
        )
        .bind(siteId, String(id), JSON.stringify(photoIds), ...args),
    )
  }
  if (password !== undefined) {
    if (password === null)
      statements.push(
        db
          .prepare(
            `DELETE FROM platform_album_access WHERE site_id=? AND album_id=? AND ${guard}`,
          )
          .bind(siteId, id, ...args),
      )
    else {
      const salt = crypto.randomUUID(),
        hash = await visitorPasswordHash(password as string, salt)
      statements.push(
        db
          .prepare(
            `INSERT INTO platform_album_access(site_id,album_id,revision,salt,password_hash) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(site_id,album_id) DO UPDATE SET revision=excluded.revision,salt=excluded.salt,password_hash=excluded.password_hash`,
          )
          .bind(siteId, id, crypto.randomUUID(), salt, hash, ...args),
      )
    }
  }
  statements.push(
    db
      .prepare(
        `UPDATE cloud_albums SET title=?,description=CASE WHEN ? THEN ? ELSE description END,cover_photo_id=CASE WHEN ? THEN ? ELSE cover_photo_id END,hidden=CASE WHEN ? THEN ? ELSE hidden END,updated_at=?,revision=revision+1 WHERE site_id=? AND id=? AND revision=?`,
      )
      .bind(
        title.trim(),
        description !== undefined ? 1 : 0,
        description ?? null,
        cover !== undefined ? 1 : 0,
        cover ?? null,
        body.isHidden !== undefined ? 1 : 0,
        body.isHidden ? 1 : 0,
        Date.now(),
        ...args,
      ),
  )
  let results
  try {
    results = await db.batch(statements)
  } catch (error) {
    if (!cloudAlbumSlugConflict(error)) throw error
    if (
      (body.slug === undefined ||
        (typeof body.slug === 'string' && !body.slug.trim())) &&
      slugAttempt < 3
    )
      return updateCloudAlbum(db, siteId, id, body, slugAttempt + 1)
    throw new CoreError(
      409,
      'Album URL slug already exists',
      'album_slug_conflict',
    )
  }
  if (results.at(-1)?.meta.changes !== 1) throw createError({ statusCode: 409 })
  return { revision: Number(revision) + 1 }
}
