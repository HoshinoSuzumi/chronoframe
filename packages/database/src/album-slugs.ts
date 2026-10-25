import { CoreError, type SiteContext } from '@chronoframe/core'
import {
  ALBUM_SLUG_MAX_LENGTH,
  isNumericAlbumPathSegment,
  isValidAlbumSlug,
} from '@chronoframe/contracts/album-slug'
import type { AlbumPathResolution } from '@chronoframe/contracts/album-slug'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { type AppDatabase } from './connection.ts'
import * as tables from './schema.ts'
import {
  generatedAlbumSlug,
  suffixedAlbumSlug,
  validateCustomAlbumSlug,
} from './album-slug.ts'

type AlbumSlugDb = Pick<AppDatabase, 'select' | 'insert' | 'update'>
const currentAlbumSlug = alias(tables.albumSlugs, 'current_album_slug')

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
    ? generatedAlbumSlug(title, `album-${albumId}`)
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
      if (existing.isCurrent) {
        if (!automatic) throw new CoreError(409, 'Album URL slug is in use')
        continue
      }
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
    if (existing)
      db.update(tables.albumSlugs)
        .set({ albumId, isCurrent: true })
        .where(
          and(
            eq(tables.albumSlugs.siteId, site.id),
            eq(tables.albumSlugs.slug, slug),
          ),
        )
        .run()
    else
      db.insert(tables.albumSlugs)
        .values({ siteId: site.id, slug, albumId, isCurrent: true })
        .run()
    return slug
  }
  throw new Error('Album slug namespace exhausted')
}

function albumsWithoutSlugs(db: AlbumSlugDb) {
  return db
    .select({
      id: tables.albums.id,
      siteId: tables.albums.siteId,
      title: tables.albums.title,
    })
    .from(tables.albums)
    .leftJoin(
      tables.albumSlugs,
      and(
        eq(tables.albumSlugs.siteId, tables.albums.siteId),
        eq(tables.albumSlugs.albumId, tables.albums.id),
        eq(tables.albumSlugs.isCurrent, true),
      ),
    )
    .where(isNull(tables.albumSlugs.slug))
}

export function backfillAlbumSlugs(db: AppDatabase) {
  if (!albumsWithoutSlugs(db).limit(1).get()) return 0
  return db.transaction(
    (tx) => {
      let created = 0
      for (const album of albumsWithoutSlugs(tx)
        .orderBy(asc(tables.albums.siteId), asc(tables.albums.id))
        .all()) {
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
): AlbumPathResolution | null {
  if (segment.length > ALBUM_SLUG_MAX_LENGTH) return null
  const numeric = isNumericAlbumPathSegment(segment)
  if (!numeric && !isValidAlbumSlug(segment)) return null
  const numericId = Number(segment)
  if (numeric && (!Number.isSafeInteger(numericId) || numericId < 1))
    return null
  const currentJoin = and(
    eq(currentAlbumSlug.siteId, tables.albums.siteId),
    eq(currentAlbumSlug.albumId, tables.albums.id),
    eq(currentAlbumSlug.isCurrent, true),
  )
  const album = numeric
    ? db
        .select({
          albumId: tables.albums.id,
          slug: currentAlbumSlug.slug,
          isHidden: tables.albums.isHidden,
        })
        .from(tables.albums)
        .leftJoin(currentAlbumSlug, currentJoin)
        .where(
          and(
            eq(tables.albums.siteId, site.id),
            eq(tables.albums.id, numericId),
          ),
        )
        .get()
    : db
        .select({
          albumId: tables.albums.id,
          slug: currentAlbumSlug.slug,
          isHidden: tables.albums.isHidden,
          isCurrent: tables.albumSlugs.isCurrent,
        })
        .from(tables.albumSlugs)
        .innerJoin(
          tables.albums,
          and(
            eq(tables.albums.id, tables.albumSlugs.albumId),
            eq(tables.albums.siteId, tables.albumSlugs.siteId),
          ),
        )
        .leftJoin(currentAlbumSlug, currentJoin)
        .where(
          and(
            eq(tables.albumSlugs.siteId, site.id),
            eq(tables.albumSlugs.slug, segment),
          ),
        )
        .get()
  if (!album) return null
  const isCurrent = 'isCurrent' in album && album.isCurrent === true
  const isCanonical = isCurrent || (numeric && album.slug === null)
  const redirectCode = isCanonical ? undefined : numeric ? 301 : 302
  return {
    albumId: album.albumId,
    slug: album.slug ?? String(album.albumId),
    isCanonical,
    isHidden: album.isHidden,
    ...(redirectCode ? { redirectCode } : {}),
  }
}
