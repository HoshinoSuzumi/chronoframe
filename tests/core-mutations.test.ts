import { DEFAULT_SITE } from '@chronoframe/core'
import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import {
  CoreError,
  createAlbumWriter,
  createPhotoWriter,
} from '@chronoframe/core'
import * as schema from '../server/database/schema.ts'
import {
  createSqliteAlbumWriteRepository,
  createSqlitePhotoWriteRepository,
} from '../server/repositories/sqlite-mutations.ts'

const now = new Date('2026-10-20T08:00:00Z')
const access = { authenticated: true }
const setup = () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/database/migrations' })
  return { sqlite, db }
}

test('album mutations preserve ordering, password semantics, cover membership and transaction rollback', async () => {
  const { sqlite, db } = setup()
  try {
    db.insert(schema.photos)
      .values([{ id: 'a' }, { id: 'b' }])
      .run()
    const writer = createAlbumWriter({
      repository: createSqliteAlbumWriteRepository(db, DEFAULT_SITE),
      clock: { now: () => now },
      hashPassword: async (value) => `hash:${value}`,
    })
    await assert.rejects(
      writer.create({ title: 'Denied' }, { authenticated: false }),
      (error: unknown) =>
        error instanceof CoreError && error.statusCode === 401,
    )
    const album = await writer.create(
      {
        title: 'First',
        photoIds: ['a', 'a'],
        coverPhotoId: 'b',
        password: 'secret',
      },
      access,
    )
    assert.equal(album.hasPassword, true)
    assert.equal('passwordHash' in album, false)
    assert.deepEqual(
      db
        .select()
        .from(schema.albumPhotos)
        .all()
        .map((row) => row.photoId),
      ['a', 'b'],
    )
    const second = await writer.create({ title: 'Second' }, access)
    assert.ok(second.position < album.position)
    await writer.update(album.id, { title: 'Changed' }, access)
    assert.equal(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, album.id))
        .get()!.passwordHash,
      'hash:secret',
    )
    const cleared = await writer.update(
      album.id,
      { password: '', photoIds: ['b'] },
      access,
    )
    assert.equal(cleared.hasPassword, false)
    await assert.rejects(
      writer.update(
        album.id,
        { title: 'Must roll back', photoIds: ['missing-photo'] },
        access,
      ),
    )
    assert.equal(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, album.id))
        .get()!.title,
      'Changed',
    )
    assert.deepEqual(
      db
        .select()
        .from(schema.albumPhotos)
        .all()
        .map((row) => row.photoId),
      ['b'],
    )
    await writer.removePhoto(album.id, 'b', access)
    assert.equal(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, album.id))
        .get()!.coverPhotoId,
      null,
    )
    await writer.reorder([album.id, second.id], access)
    assert.equal(
      db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, second.id))
        .get()!.position,
      1000,
    )
    await writer.delete(album.id, access)
    assert.equal(db.select().from(schema.photos).all().length, 2)
    await assert.rejects(
      writer.delete(album.id, access),
      (error: unknown) =>
        error instanceof CoreError && error.statusCode === 404,
    )
  } finally {
    sqlite.close()
  }
})

test('photo mutations keep normalized EXIF and database edits aligned and persist follow-up tasks atomically and tolerate cleanup failures', async () => {
  const { sqlite, db } = setup()
  const deleted: string[] = []
  const edits: unknown[] = []
  const warnings: string[] = []
  try {
    db.insert(schema.photos)
      .values({
        id: 'p',
        storageKey: 'p.HEIC',
        thumbnailKey: 'p.webp',
        livePhotoVideoKey: 'p.mp4',
        title: 'Original',
        latitude: 31,
        longitude: 121,
      })
      .run()
    const writer = createPhotoWriter({
      repository: createSqlitePhotoWriteRepository(db, DEFAULT_SITE),
      clock: { now: () => now },
      storage: {
        forPhoto: async () => ({
          async delete(key) {
            deleted.push(key)
            if (key === 'p.HEIC') throw new Error('storage failure')
          },
        }),
      },
      editMetadata: async (_photo, input) => {
        edits.push(input)
        return { exif: null, fileSize: 100 }
      },
      warn: (_error, operation) => warnings.push(operation),
    })
    await assert.rejects(
      writer.update('p', {}, access),
      (error: unknown) =>
        error instanceof CoreError && error.statusCode === 400,
    )
    const updated = await writer.update(
      'p',
      {
        title: '  New  ',
        tags: [' Tag ', 'tag', '', 'Other'],
        location: { latitude: 32, longitude: 120 },
      },
      access,
    )
    assert.equal(updated.photo!.title, 'New')
    assert.deepEqual(updated.photo!.tags, ['Tag', 'Other'])
    assert.equal(updated.photo!.lastModified, now.toISOString())
    assert.equal(updated.photo!.geocoding, null)
    assert.deepEqual(edits[0], {
      title: 'New',
      tags: ['Tag', 'Other'],
      location: { latitude: 32, longitude: 120 },
    })
    assert.deepEqual(warnings, [])
    const queued = db.select().from(schema.pipelineQueue).all()
    assert.equal(queued.length, 1)
    assert.deepEqual(queued[0]!.payload, {
      type: 'photo-reverse-geocoding',
      photoId: 'p',
      latitude: 32,
      longitude: 120,
    })
    const erased = await writer.update(
      'p',
      { title: ' ', location: null },
      access,
    )
    assert.equal(erased.photo!.title, null)
    assert.equal(erased.photo!.latitude, null)
    await writer.delete('p', access)
    assert.deepEqual(deleted, ['p.HEIC', 'p.webp', 'p.mp4', 'p.jpeg'])
    assert.equal(db.select().from(schema.photos).get(), undefined)
    assert.ok(warnings.includes('delete-photo-object'))
  } finally {
    sqlite.close()
  }
})
