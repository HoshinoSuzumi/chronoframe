import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../apps/self-hosted/server/database/schema.ts'
import { persistPhotoWithAlbum } from '../apps/self-hosted/server/utils/photo-album.ts'

const setup = () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, {
    migrationsFolder: './apps/self-hosted/server/database/migrations',
  })
  return { sqlite, db }
}

test('successful photo processing appends once and preserves album order', () => {
  const { sqlite, db } = setup()
  try {
    const originalUpdatedAt = new Date('2020-01-01T00:00:00Z')
    const album = db
      .insert(schema.albums)
      .values({ title: 'Trip', updatedAt: originalUpdatedAt })
      .returning()
      .get()
    db.insert(schema.photos).values({ id: 'existing' }).run()
    db.insert(schema.albumPhotos)
      .values({ albumId: album.id, photoId: 'existing', position: 25 })
      .run()
    assert.equal(persistPhotoWithAlbum(db, { id: 'first' }, album.id), 'added')
    assert.equal(persistPhotoWithAlbum(db, { id: 'second' }, album.id), 'added')

    assert.ok(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, album.id))
        .get()!
        .updatedAt.getTime() > originalUpdatedAt.getTime(),
    )

    const beforeRetry = db
      .select()
      .from(schema.albumPhotos)
      .orderBy(schema.albumPhotos.position)
      .all()
    assert.deepEqual(
      beforeRetry.map(({ photoId }) => photoId),
      ['existing', 'first', 'second'],
    )
    assert.equal(beforeRetry[0]!.position, 25)
    assert.ok(beforeRetry[1]!.position > beforeRetry[0]!.position)
    assert.ok(beforeRetry[2]!.position > beforeRetry[1]!.position)

    const sentinelUpdatedAt = new Date('2020-01-02T00:00:00Z')
    db.update(schema.albums)
      .set({ updatedAt: sentinelUpdatedAt })
      .where(eq(schema.albums.id, album.id))
      .run()

    assert.equal(
      persistPhotoWithAlbum(db, { id: 'first', title: 'Updated' }, album.id),
      'already-added',
    )
    assert.equal(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, album.id))
        .get()!
        .updatedAt.getTime(),
      sentinelUpdatedAt.getTime(),
    )
    const afterRetry = db
      .select()
      .from(schema.albumPhotos)
      .orderBy(schema.albumPhotos.position)
      .all()
    assert.equal(afterRetry.length, 3)
    assert.equal(afterRetry[1]!.position, beforeRetry[1]!.position)
    assert.equal(
      db
        .select()
        .from(schema.photos)
        .all()
        .find(({ id }) => id === 'first')!.title,
      'Updated',
    )
  } finally {
    sqlite.close()
  }
})

test('a race that skips the membership insert reports already added', () => {
  const { sqlite, db } = setup()
  try {
    const album = db
      .insert(schema.albums)
      .values({ title: 'Trip' })
      .returning()
      .get()

    // Simulate a concurrent writer winning the unique-index race after the
    // existence check but before the insert.
    sqlite.exec(`
      CREATE TRIGGER skip_album_photo_insert
      BEFORE INSERT ON album_photos
      BEGIN
        SELECT RAISE(IGNORE);
      END
    `)

    assert.equal(
      persistPhotoWithAlbum(db, { id: 'raced' }, album.id),
      'already-added',
    )
    assert.equal(db.select().from(schema.albumPhotos).all().length, 0)
  } finally {
    sqlite.close()
  }
})

test('no target and deleted target both preserve the processed photo', () => {
  const { sqlite, db } = setup()
  try {
    assert.equal(persistPhotoWithAlbum(db, { id: 'plain' }), 'no-album')
    assert.equal(
      persistPhotoWithAlbum(db, { id: 'missing-target' }, 999),
      'album-missing',
    )
    assert.deepEqual(
      db
        .select()
        .from(schema.photos)
        .all()
        .map(({ id }) => id),
      ['plain', 'missing-target'],
    )
    assert.equal(db.select().from(schema.albumPhotos).all().length, 0)
  } finally {
    sqlite.close()
  }
})

test('migration keeps the earliest album position while removing legacy duplicates', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec('CREATE TABLE pipeline_queue (id INTEGER PRIMARY KEY)')
    sqlite.exec(
      'CREATE TABLE album_photos (id INTEGER PRIMARY KEY, album_id INTEGER, photo_id TEXT, position REAL)',
    )
    sqlite.exec(`INSERT INTO album_photos VALUES
      (1, 1, 'photo', 30),
      (2, 1, 'photo', 10),
      (3, 1, 'photo', 20),
      (4, 2, 'photo', 15)`)

    const migration = readFileSync(
      'apps/self-hosted/server/database/migrations/0016_upload_album_membership.sql',
      'utf8',
    )
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement)
    }

    assert.deepEqual(
      sqlite
        .prepare('SELECT id, position FROM album_photos ORDER BY album_id')
        .all(),
      [
        { id: 2, position: 10 },
        { id: 4, position: 15 },
      ],
    )
    assert.throws(() =>
      sqlite.exec("INSERT INTO album_photos VALUES (5, 1, 'photo', 40)"),
    )
  } finally {
    sqlite.close()
  }
})
