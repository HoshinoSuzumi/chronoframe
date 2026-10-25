import { CoreError } from '@chronoframe/core'
import {
  generatedAlbumSlug,
  suffixedAlbumSlug,
  validateCustomAlbumSlug,
} from '@chronoframe/core/album-slug'
import {
  ALBUM_SLUG_MAX_LENGTH,
  isNumericAlbumPathSegment,
  isValidAlbumSlug,
} from '@chronoframe/contracts/album-slug'
import type { MediaDatabase } from './cloud-media.ts'

async function rows<T>(
  db: MediaDatabase,
  sql: string,
  ...values: (string | number | null)[]
) {
  return (
    await db
      .prepare(sql)
      .bind(...values)
      .all<T>()
  ).results
}
export function cloudAlbumSlugConflict(error: unknown): boolean {
  return /(?:NOT NULL constraint failed: cloud_album_slugs.site_id|UNIQUE constraint failed: cloud_album_slugs)/.test(
    String(error),
  )
}
/** Every statement retains the caller's revision/creation guard inside the D1 batch. */
export async function prepareCloudAlbumSlug(
  db: MediaDatabase,
  siteId: number,
  albumId: string,
  title: string,
  requested: unknown,
  guard: string,
  args: (string | number | null)[],
) {
  if (requested !== undefined && typeof requested !== 'string')
    throw new CoreError(400, 'Invalid album URL slug')
  const current = (
    await rows<{ slug: string }>(
      db,
      'SELECT slug FROM cloud_album_slugs WHERE site_id=? AND album_id=? AND is_current=1',
      siteId,
      albumId,
    )
  )[0]?.slug
  if (requested === undefined && current)
    return { slug: current, statements: [] }
  const automatic = requested === undefined || String(requested).trim() === ''
  let slug: string
  if (automatic) {
    const base = generatedAlbumSlug(title)
    const candidates = Array.from({ length: 1001 }, (_, i) =>
      suffixedAlbumSlug(base, i),
    )
    const available = await rows<{ slug: string }>(
      db,
      `SELECT value AS slug FROM json_each(?) WHERE NOT EXISTS(SELECT 1 FROM cloud_album_slugs s WHERE s.site_id=? AND s.slug=value AND (s.album_id IS NULL OR s.album_id<>?)) ORDER BY CAST(key AS INTEGER) LIMIT 1`,
      JSON.stringify(candidates),
      siteId,
      albumId,
    )
    if (!available[0])
      throw new CoreError(409, 'Choose a different album URL slug')
    slug = available[0].slug
  } else slug = validateCustomAlbumSlug(String(requested))
  const statements = [
    // A conflicting owner/tombstone deliberately violates NOT NULL. D1 rolls the
    // WHOLE batch back, rather than clearing the old current URL and losing it.
    db
      .prepare(
        `INSERT INTO cloud_album_slugs(site_id,slug,album_id,is_current) SELECT ?,?,?,0 WHERE ${guard} ON CONFLICT(site_id,slug) DO UPDATE SET site_id=CASE WHEN cloud_album_slugs.album_id=excluded.album_id THEN cloud_album_slugs.site_id ELSE NULL END`,
      )
      .bind(siteId, slug, albumId, ...args),
    db
      .prepare(
        `UPDATE cloud_album_slugs SET is_current=0 WHERE site_id=? AND album_id=? AND is_current=1 AND ${guard}`,
      )
      .bind(siteId, albumId, ...args),
    db
      .prepare(
        `UPDATE cloud_album_slugs SET is_current=1 WHERE site_id=? AND slug=? AND album_id=? AND ${guard}`,
      )
      .bind(siteId, slug, albumId, ...args),
  ]
  return { slug, statements }
}
/** Lazy, idempotent repair matches SQLite's startup backfill without requiring Node in D1 migrations. */
export async function ensureCloudAlbumSlugs(db: MediaDatabase, siteId: number) {
  const missing = await rows<{ id: string; title: string }>(
    db,
    `SELECT id,title FROM cloud_albums a WHERE site_id=? AND NOT EXISTS(SELECT 1 FROM cloud_album_slugs s WHERE s.site_id=a.site_id AND s.album_id=a.id AND s.is_current=1) ORDER BY CAST(id AS INTEGER) LIMIT 100`,
    siteId,
  )
  for (const album of missing) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const guard =
        'EXISTS(SELECT 1 FROM cloud_albums WHERE site_id=? AND id=?) AND NOT EXISTS(SELECT 1 FROM cloud_album_slugs WHERE site_id=? AND album_id=? AND is_current=1)'
      const claim = await prepareCloudAlbumSlug(
        db,
        siteId,
        album.id,
        album.title,
        undefined,
        guard,
        [siteId, album.id, siteId, album.id],
      )
      if (!claim.statements.length) break
      try {
        await db.batch(claim.statements)
        break
      } catch (error) {
        if (!cloudAlbumSlugConflict(error) || attempt === 3) throw error
      }
    }
  }
}
export async function createCloudAlbumWithSlug(
  db: MediaDatabase,
  siteId: number,
  id: string,
  title: string,
  options: { hidden?: boolean; slug?: unknown } = {},
) {
  if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw new CoreError(400, 'Canonical numeric album ID required')
  if (options.slug !== undefined && typeof options.slug !== 'string')
    throw new CoreError(400, 'Invalid album URL slug')
  const existing = (
    await rows<{ title: string }>(
      db,
      'SELECT title FROM cloud_albums WHERE site_id=? AND id=?',
      siteId,
      id,
    )
  )[0]
  if (existing) {
    if (existing.title !== title)
      throw new CoreError(409, 'Album identifier already used')
    await ensureCloudAlbumSlugs(db, siteId)
    const current = (
      await rows<{ slug: string }>(
        db,
        'SELECT slug FROM cloud_album_slugs WHERE site_id=? AND album_id=? AND is_current=1',
        siteId,
        id,
      )
    )[0]!
    if (
      typeof options.slug === 'string' &&
      options.slug.trim() &&
      options.slug.trim() !== current.slug
    )
      throw new CoreError(409, 'Album identifier already used')
    return current.slug
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const guard =
      'EXISTS(SELECT 1 FROM cloud_albums WHERE site_id=? AND id=? AND title=?) AND NOT EXISTS(SELECT 1 FROM cloud_album_slugs WHERE site_id=? AND album_id=? AND is_current=1)'
    const claim = await prepareCloudAlbumSlug(
      db,
      siteId,
      id,
      title,
      options.slug,
      guard,
      [siteId, id, title, siteId, id],
    )
    const now = Date.now()
    try {
      await db.batch([
        db
          .prepare(
            'INSERT INTO cloud_albums(site_id,id,title,hidden,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM cloud_albums WHERE site_id=?)<100 ON CONFLICT DO NOTHING',
          )
          .bind(siteId, id, title, options.hidden ? 1 : 0, now, now, siteId),
        ...claim.statements,
      ])
      const result = (
        await rows<{ title: string; slug: string }>(
          db,
          'SELECT a.title,s.slug FROM cloud_albums a JOIN cloud_album_slugs s ON s.site_id=a.site_id AND s.album_id=a.id AND s.is_current=1 WHERE a.site_id=? AND a.id=?',
          siteId,
          id,
        )
      )[0]
      if (!result) throw new CoreError(429, 'Album limit reached')
      if (
        result.title !== title ||
        (typeof options.slug === 'string' &&
          options.slug.trim() &&
          options.slug.trim() !== result.slug)
      )
        throw new CoreError(409, 'Album identifier already used')
      return result.slug
    } catch (error) {
      if (!cloudAlbumSlugConflict(error)) throw error
      if (
        (typeof options.slug === 'string' && options.slug.trim()) ||
        attempt === 3
      )
        throw new CoreError(
          409,
          'Album URL slug already exists',
          'album_slug_conflict',
        )
    }
  }
  throw new CoreError(
    409,
    'Album URL slug already exists',
    'album_slug_conflict',
  )
}
export async function resolveCloudAlbumPath(
  db: MediaDatabase,
  siteId: number,
  segment: string,
) {
  if (segment.length > ALBUM_SLUG_MAX_LENGTH) return null
  const numeric = isNumericAlbumPathSegment(segment)
  if (
    numeric &&
    (!Number.isSafeInteger(Number(segment)) || Number(segment) < 1)
  )
    return null
  if (!numeric && !isValidAlbumSlug(segment)) return null
  await ensureCloudAlbumSlugs(db, siteId)
  const result = (
    await rows<{ albumId: string; slug: string; hidden: number }>(
      db,
      `SELECT a.id AS albumId,current.slug,a.hidden FROM cloud_albums a JOIN cloud_album_slugs current ON current.site_id=a.site_id AND current.album_id=a.id AND current.is_current=1 ${numeric ? '' : 'JOIN cloud_album_slugs requested ON requested.site_id=a.site_id AND requested.album_id=a.id'} WHERE a.site_id=? AND ${numeric ? 'a.id=?' : 'requested.slug=?'}`,
      siteId,
      numeric ? String(Number(segment)) : segment,
    )
  )[0]
  return result
    ? {
        albumId: Number(result.albumId),
        slug: result.slug,
        isCanonical: !numeric && segment === result.slug,
        isHidden: !!result.hidden,
      }
    : null
}
