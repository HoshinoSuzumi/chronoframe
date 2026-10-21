import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../apps/self-hosted/server/database/schema.ts'
import {
  photoTaskAlbumExists,
  queuePayloadSchema,
} from '../apps/self-hosted/server/utils/queue-payload.ts'

test('photo queue payload accepts an optional positive album ID', () => {
  assert.deepEqual(
    queuePayloadSchema.parse({ type: 'photo', storageKey: 'image.jpg' }),
    { type: 'photo', storageKey: 'image.jpg' },
  )
  assert.deepEqual(
    queuePayloadSchema.parse({
      type: 'photo',
      storageKey: 'image.jpg',
      albumId: 7,
    }),
    { type: 'photo', storageKey: 'image.jpg', albumId: 7 },
  )
})

test('photo queue payload rejects invalid albums and video album IDs', () => {
  for (const albumId of [0, -1, 1.5, '7', null]) {
    assert.equal(
      queuePayloadSchema.safeParse({
        type: 'photo',
        storageKey: 'image.jpg',
        albumId,
      }).success,
      false,
    )
  }
  assert.equal(
    queuePayloadSchema.safeParse({
      type: 'live-photo-video',
      storageKey: 'image.mov',
      albumId: 7,
    }).success,
    false,
  )
  assert.equal(
    queuePayloadSchema.safeParse({
      type: 'live-photo-video',
      storageKey: 'image.mov',
    }).success,
    true,
  )
})

test('photo tasks only target existing albums', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      'CREATE TABLE albums (id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL DEFAULT 1)',
    )
    sqlite.exec('INSERT INTO albums (id) VALUES (7)')
    const db = drizzle(sqlite, { schema })
    assert.equal(
      photoTaskAlbumExists(
        { type: 'photo', storageKey: 'image.jpg', albumId: 7 },
        db,
      ),
      true,
    )
    assert.equal(
      photoTaskAlbumExists({ type: 'photo', storageKey: 'image.jpg' }, db),
      true,
    )
    assert.equal(
      photoTaskAlbumExists(
        { type: 'photo', storageKey: 'image.jpg', albumId: 8 },
        db,
      ),
      false,
    )
  } finally {
    sqlite.close()
  }
})
