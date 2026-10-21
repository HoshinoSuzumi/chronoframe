import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../server/database/schema.ts'
import { addExistingPhotosToAlbum } from '../server/utils/album-photos-add.ts'

const setup = () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/database/migrations' })
  return { sqlite, db }
}

test('bulk add appends missing photos without changing existing membership or cover', () => {
  const { sqlite, db } = setup()
  try {
    db.insert(schema.photos)
      .values([{ id: 'cover' }, { id: 'new-a' }, { id: 'new-b' }])
      .run()
    const originalUpdatedAt = new Date('2020-01-01T00:00:00Z')
    const album = db
      .insert(schema.albums)
      .values({
        title: 'Trip',
        coverPhotoId: 'cover',
        updatedAt: originalUpdatedAt,
      })
      .returning()
      .get()
    db.insert(schema.albumPhotos)
      .values({ albumId: album.id, photoId: 'cover', position: 25 })
      .run()

    assert.deepEqual(
      addExistingPhotosToAlbum(db, album.id, ['new-a', 'cover', 'new-b']),
      { added: 2, alreadyPresent: 1, missing: 0 },
    )
    assert.ok(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, album.id))
        .get()!
        .updatedAt.getTime() > originalUpdatedAt.getTime(),
    )
    assert.deepEqual(
      db
        .select({
          photoId: schema.albumPhotos.photoId,
          position: schema.albumPhotos.position,
        })
        .from(schema.albumPhotos)
        .orderBy(schema.albumPhotos.position)
        .all(),
      [
        { photoId: 'cover', position: 25 },
        { photoId: 'new-a', position: 35 },
        { photoId: 'new-b', position: 45 },
      ],
    )
    assert.equal(db.select().from(schema.albums).get()!.coverPhotoId, 'cover')

    const sentinelUpdatedAt = new Date('2020-01-02T00:00:00Z')
    db.update(schema.albums)
      .set({ updatedAt: sentinelUpdatedAt })
      .where(eq(schema.albums.id, album.id))
      .run()

    assert.deepEqual(
      addExistingPhotosToAlbum(db, album.id, ['new-a', 'cover', 'new-b']),
      { added: 0, alreadyPresent: 3, missing: 0 },
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
    assert.deepEqual(
      addExistingPhotosToAlbum(db, album.id, ['new-a', 'new-a']),
      { added: 0, alreadyPresent: 1, missing: 0 },
    )
    assert.equal(db.select().from(schema.albumPhotos).all().length, 3)
  } finally {
    sqlite.close()
  }
})

test('bulk add rejects missing albums', () => {
  const { sqlite, db } = setup()
  try {
    db.insert(schema.photos).values({ id: 'exists' }).run()

    assert.deepEqual(addExistingPhotosToAlbum(db, 999, ['exists']), {
      error: 'album-not-found',
    })
  } finally {
    sqlite.close()
  }
})

test('bulk add skips missing photos and reports them', () => {
  const { sqlite, db } = setup()
  try {
    const album = db
      .insert(schema.albums)
      .values({ title: 'Trip' })
      .returning()
      .get()
    db.insert(schema.photos).values({ id: 'exists' }).run()

    assert.deepEqual(
      addExistingPhotosToAlbum(db, album.id, ['exists', 'missing']),
      { added: 1, alreadyPresent: 0, missing: 1 },
    )
    assert.deepEqual(addExistingPhotosToAlbum(db, album.id, ['missing']), {
      added: 0,
      alreadyPresent: 0,
      missing: 1,
    })
    assert.deepEqual(
      addExistingPhotosToAlbum(db, album.id, ['exists', 'missing']),
      { added: 0, alreadyPresent: 1, missing: 1 },
    )
    assert.deepEqual(
      db
        .select({ photoId: schema.albumPhotos.photoId })
        .from(schema.albumPhotos)
        .all(),
      [{ photoId: 'exists' }],
    )
  } finally {
    sqlite.close()
  }
})

test('bulk add handles selections larger than one SQLite query chunk', () => {
  const { sqlite, db } = setup()
  try {
    const album = db
      .insert(schema.albums)
      .values({ title: 'Trip' })
      .returning()
      .get()
    const photoIds = Array.from({ length: 405 }, (_, index) => `photo-${index}`)
    db.insert(schema.photos)
      .values(photoIds.map((id) => ({ id })))
      .run()
    db.insert(schema.albumPhotos)
      .values({ albumId: album.id, photoId: 'photo-100', position: 25 })
      .run()

    assert.deepEqual(addExistingPhotosToAlbum(db, album.id, photoIds), {
      added: 404,
      alreadyPresent: 1,
      missing: 0,
    })
    const memberships = db
      .select({
        photoId: schema.albumPhotos.photoId,
        position: schema.albumPhotos.position,
      })
      .from(schema.albumPhotos)
      .orderBy(schema.albumPhotos.position)
      .all()
    assert.deepEqual(memberships, [
      { photoId: 'photo-100', position: 25 },
      ...photoIds
        .filter((id) => id !== 'photo-100')
        .map((photoId, index) => ({ photoId, position: 35 + index * 10 })),
    ])
  } finally {
    sqlite.close()
  }
})
