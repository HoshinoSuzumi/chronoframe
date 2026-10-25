import { CoreError, type SiteContext } from '@chronoframe/core'
import {
  ALBUM_SLUG_MAX_LENGTH,
  isNumericAlbumPathSegment,
  isValidAlbumSlug,
} from '@chronoframe/contracts/album-slug'
import { and, asc, eq } from 'drizzle-orm'
import { type AppDatabase } from './connection.ts'
import * as tables from './schema.ts'
import {
  generatedAlbumSlug,
  suffixedAlbumSlug,
  validateCustomAlbumSlug,
} from './album-slug.ts'

type AlbumSlugDb = Pick<AppDatabase, 'select' | 'insert' | 'update'>

function currentSlug(db: AlbumSlugDb, siteId: number, albumId: number) {
  return db
    .select({ slug: tables.albumSlugs.slug })
    .from(tables.albumSlugs)
    .where(
      and(
        eq(tables.albumSlugs.siteId, siteId),
        eq(tables.albumSlugs.albumId, albumId),
        eq(tables.albumSlugs.isCurrent, true),
      ),
    )
    .get()?.slug
}

export function getCurrentAlbumSlug(
  db: AlbumSlugDb,
  site: SiteContext,
  albumId: number,
): string | null {
  return currentSlug(db, site.id, albumId) ?? null
}

/** Must run inside the caller's transaction. The registry is the sole slug namespace. */
export function claimAlbumSlug(
  db: AlbumSlugDb,
  site: SiteContext,
  albumId: number,
  title: string,
  requestedSlug: string,
): string {
  const automatic = requestedSlug.trim() === ''
  const base = automatic
    ? generatedAlbumSlug(title)
    : validateCustomAlbumSlug(requestedSlug)
  for (let suffix = 0; suffix < 1_000_000; suffix++) {
    const slug = automatic ? suffixedAlbumSlug(base, suffix) : base
    const existing = db
      .select()
      .from(tables.albumSlugs)
      .where(
        and(
          eq(tables.albumSlugs.siteId, site.id),
          eq(tables.albumSlugs.slug, slug),
        ),
      )
      .get()
    if (existing) {
      if (existing.albumId === albumId && existing.isCurrent) return slug
      if (!automatic) throw new CoreError(409, 'Album URL slug already exists')
      continue
    }
    db.update(tables.albumSlugs)
      .set({ isCurrent: false })
      .where(
        and(
          eq(tables.albumSlugs.siteId, site.id),
          eq(tables.albumSlugs.albumId, albumId),
          eq(tables.albumSlugs.isCurrent, true),
        ),
      )
      .run()
    db.insert(tables.albumSlugs)
      .values({ siteId: site.id, slug, albumId, isCurrent: true })
      .run()
    return slug
  }
  throw new Error('Album slug namespace exhausted')
}

/** Repeatable repair for old installations and rollback-created albums. */
export function backfillAlbumSlugs(db: AppDatabase) {
  return db.transaction(
    (tx) => {
      const albums = tx
        .select({
          id: tables.albums.id,
          siteId: tables.albums.siteId,
          title: tables.albums.title,
        })
        .from(tables.albums)
        .orderBy(asc(tables.albums.siteId), asc(tables.albums.id))
        .all()
      let created = 0
      for (const album of albums) {
        if (currentSlug(tx, album.siteId, album.id)) continue
        claimAlbumSlug(tx, { id: album.siteId }, album.id, album.title, '')
        created++
      }
      return created
    },
    { behavior: 'immediate' },
  )
}

export function resolveAlbumSlug(
  db: AppDatabase,
  site: SiteContext,
  slug: string,
) {
  return db
    .select({
      albumId: tables.albumSlugs.albumId,
      isCurrent: tables.albumSlugs.isCurrent,
    })
    .from(tables.albumSlugs)
    .where(
      and(
        eq(tables.albumSlugs.siteId, site.id),
        eq(tables.albumSlugs.slug, slug),
      ),
    )
    .get()
}

/** Resolve both old numeric paths and current/historical public slugs. */
export function resolveAlbumPath(
  db: AppDatabase,
  site: SiteContext,
  segment: string,
) {
  if (segment.length > ALBUM_SLUG_MAX_LENGTH) return null
  let albumId: number | null = null
  let isCurrent = false
  if (isNumericAlbumPathSegment(segment)) {
    const number = Number(segment)
    if (Number.isSafeInteger(number) && number > 0) albumId = number
  } else if (isValidAlbumSlug(segment)) {
    const entry = resolveAlbumSlug(db, site, segment)
    albumId = entry?.albumId ?? null
    isCurrent = entry?.isCurrent ?? false
  }
  if (albumId === null) return null
  const album = db
    .select({ isHidden: tables.albums.isHidden })
    .from(tables.albums)
    .where(
      and(eq(tables.albums.siteId, site.id), eq(tables.albums.id, albumId)),
    )
    .get()
  if (!album) return null
  const slug = getCurrentAlbumSlug(db, site, albumId)
  return {
    albumId,
    slug: slug ?? String(albumId),
    isCanonical:
      isCurrent || (slug === null && isNumericAlbumPathSegment(segment)),
    isHidden: album.isHidden,
  }
}
