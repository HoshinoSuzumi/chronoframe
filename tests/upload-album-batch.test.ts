import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../apps/self-hosted/server/database/schema.ts'
import { createPhotoTaskAlbumChecker } from '../apps/self-hosted/server/utils/queue-payload.ts'

test('batch album checker queries once per distinct album ID', () => {
  const queries: string[] = []
  const sqlite = new Database(':memory:', {
    verbose: (query) => queries.push(query),
  })
  try {
    sqlite.exec(
      'CREATE TABLE albums (id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL DEFAULT 1)',
    )
    sqlite.exec('INSERT INTO albums (id) VALUES (7)')
    const db = drizzle(sqlite, { schema })
    const albumExists = createPhotoTaskAlbumChecker(db)

    assert.equal(
      albumExists({ type: 'photo', storageKey: 'a.jpg', albumId: 7 }),
      true,
    )
    assert.equal(
      albumExists({ type: 'photo', storageKey: 'b.jpg', albumId: 7 }),
      true,
    )
    assert.equal(
      albumExists({ type: 'photo', storageKey: 'c.jpg', albumId: 8 }),
      false,
    )
    assert.equal(
      albumExists({ type: 'photo', storageKey: 'd.jpg', albumId: 8 }),
      false,
    )
    assert.equal(albumExists({ type: 'photo', storageKey: 'e.jpg' }), true)
    assert.equal(
      albumExists({ type: 'live-photo-video', storageKey: 'f.mov' }),
      true,
    )
    assert.equal(
      queries.filter((query) => /select.*from.*albums/i.test(query)).length,
      2,
    )
  } finally {
    sqlite.close()
  }
})
