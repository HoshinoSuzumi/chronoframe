import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

import * as schema from '../server/database/schema.ts'
import { fetchAlbumPhotos } from '../server/utils/album-visibility.ts'

const { photos, albums, albumPhotos } = schema

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

const shared = { sqlite: null, db: null }

async function setupDb() {
  if (shared.db) return shared

  const sqlite = new Database(':memory:')
  sqlite.exec(SCHEMA_SQL)
  const db = drizzle(sqlite, { schema })

  const now = new Date()
  await db.insert(albums).values([
    { id: 1, title: 'Public', isHidden: false, createdAt: now, updatedAt: now },
    { id: 2, title: 'Secret', isHidden: true, createdAt: now, updatedAt: now },
  ]).run()
  await db.insert(photos).values([
    { id: 'p1', dateTaken: '2025-01-01', isLivePhoto: 0 },
    { id: 'p2', dateTaken: '2025-01-02', isLivePhoto: 0 },
    { id: 'p3', dateTaken: '2025-01-03', isLivePhoto: 0 },
  ]).run()
  await db.insert(albumPhotos).values([
    { albumId: 1, photoId: 'p1', position: 1, addedAt: now },
    { albumId: 1, photoId: 'p2', position: 2, addedAt: now },
    { albumId: 2, photoId: 'p2', position: 1, addedAt: now },
    { albumId: 2, photoId: 'p3', position: 2, addedAt: now },
  ]).run()

  shared.sqlite = sqlite
  shared.db = db
  return shared
}

test('anonymous viewer of public album does not see photos shared with a hidden album', async () => {
  const { db } = await setupDb()
  const ids = (await fetchAlbumPhotos(db, schema, 1, false)).map(
    (r) => r.id,
  )
  assert.deepEqual(ids, ['p1'])
})

test('authenticated viewer still sees every photo in each album', async () => {
  const { db } = await setupDb()
  const publicIds = (await fetchAlbumPhotos(db, schema, 1, true))
    .map((r) => r.id)
    .sort()
  const secretIds = (await fetchAlbumPhotos(db, schema, 2, true))
    .map((r) => r.id)
    .sort()

  assert.deepEqual(publicIds, ['p1', 'p2'])
  assert.deepEqual(secretIds, ['p2', 'p3'])
})

test('hidden-album membership set drives the exclusion', async () => {
  const { db } = await setupDb()
  const hiddenIds = db
    .select({ photoId: albumPhotos.photoId })
    .from(albumPhotos)
    .innerJoin(albums, eq(albumPhotos.albumId, albums.id))
    .where(eq(albums.isHidden, true))
    .all()
    .map((r) => r.photoId)

  assert.deepEqual(new Set(hiddenIds), new Set(['p2', 'p3']))
})

after(() => {
  shared.sqlite?.close()
})
