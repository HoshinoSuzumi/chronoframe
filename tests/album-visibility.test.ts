/**
 * Regression coverage for https://github.com/HoshinoSuzumi/chronoframe/issues/299
 *
 * A photo that exists in both a public and a hidden album must not leak into
 * the public album's photo list / count when the viewer is unauthenticated.
 *
 * The test imports the shared helper that backs
 * `server/api/albums/[albumId]/index.get.ts` so the contract is exercised
 * against the same SQL the production handler emits, without standing up the
 * full Nitro event-handler runtime.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

import * as schema from '../server/database/schema'
import { fetchAlbumPhotos } from '../server/utils/album-visibility'

const { photos, albums, albumPhotos } = schema

let sqlite: Database.Database
let db: ReturnType<typeof drizzle<typeof schema>>

const SCHEMA_SQL = `
  CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    title TEXT, date_taken TEXT, storage_key TEXT, thumbnail_key TEXT,
    original_url TEXT, thumbnail_url TEXT, thumbnail_hash TEXT,
    file_size INTEGER, aspect_ratio REAL, tags TEXT, exif TEXT,
    latitude REAL, longitude REAL, country TEXT, city TEXT,
    location_name TEXT,
    is_live_photo INTEGER NOT NULL DEFAULT 0,
    live_photo_video_url TEXT, live_photo_video_key TEXT,
    width INTEGER, height INTEGER, description TEXT, last_modified TEXT
  );
  CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, description TEXT, cover_photo_id TEXT,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT, position REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE album_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL, photo_id TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 1000000,
    added_at INTEGER NOT NULL
  );
`

beforeEach(async () => {
  sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_SQL)
  db = drizzle(sqlite, { schema })

  const now = new Date()
  await db.insert(albums).values([
    { id: 1, title: 'Public', isHidden: false, createdAt: now, updatedAt: now },
    { id: 2, title: 'Secret', isHidden: true, createdAt: now, updatedAt: now },
  ])
  await db.insert(photos).values([
    { id: 'p1', dateTaken: '2025-01-01', isLivePhoto: 0 },
    { id: 'p2', dateTaken: '2025-01-02', isLivePhoto: 0 },
    { id: 'p3', dateTaken: '2025-01-03', isLivePhoto: 0 },
  ])
  await db.insert(albumPhotos).values([
    { albumId: 1, photoId: 'p1', position: 1, addedAt: now },
    { albumId: 1, photoId: 'p2', position: 2, addedAt: now },
    { albumId: 2, photoId: 'p2', position: 1, addedAt: now },
    { albumId: 2, photoId: 'p3', position: 2, addedAt: now },
  ])
})

afterEach(() => {
  sqlite?.close()
})

describe('issue #299 — public album must not leak photos also in a hidden album', () => {
  it('anonymous viewer of public album does not see photos shared with a hidden album', async () => {
    const ids = (await fetchAlbumPhotos(db, schema, 1, false)).map(
      (r: { id: string }) => r.id,
    )
    expect(ids).toEqual(['p1'])
  })

  it('authenticated viewer still sees every photo in each album', async () => {
    const publicIds = (await fetchAlbumPhotos(db, schema, 1, true))
      .map((r: { id: string }) => r.id)
      .sort()
    const secretIds = (await fetchAlbumPhotos(db, schema, 2, true))
      .map((r: { id: string }) => r.id)
      .sort()

    expect(publicIds).toEqual(['p1', 'p2'])
    expect(secretIds).toEqual(['p2', 'p3'])
  })

  it('hidden-album membership set drives the exclusion', async () => {
    const hiddenIds = (
      await db
        .select({ photoId: albumPhotos.photoId })
        .from(albumPhotos)
        .innerJoin(albums, eq(albumPhotos.albumId, albums.id))
        .where(eq(albums.isHidden, true))
        .all()
    ).map((r) => r.photoId)

    expect(new Set(hiddenIds)).toEqual(new Set(['p2', 'p3']))
  })
})
