import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../apps/self-hosted/server/database/schema.ts'
import { listUploadAlbumOptions } from '../apps/self-hosted/server/utils/upload-album-options.ts'

test('upload album options include metadata in album order', () => {
  const sqlite = new Database(':memory:')
  try {
    const db = drizzle(sqlite, { schema })
    migrate(db, {
      migrationsFolder: './apps/self-hosted/server/database/migrations',
    })
    const later = db
      .insert(schema.albums)
      .values({
        title: 'Later',
        description: 'Summer photos',
        position: 20,
        passwordHash: 'test-hash',
      })
      .returning()
      .get()
    const first = db
      .insert(schema.albums)
      .values({ title: 'First', position: 10, isHidden: true })
      .returning()
      .get()
    db.insert(schema.photos).values({ id: 'photo' }).run()
    db.insert(schema.albumPhotos)
      .values({ albumId: later.id, photoId: 'photo' })
      .run()

    assert.deepEqual(listUploadAlbumOptions(db), [
      {
        id: first.id,
        title: 'First',
        photoCount: 0,
        isHidden: true,
        hasPassword: false,
      },
      {
        id: later.id,
        title: 'Later',
        photoCount: 1,
        isHidden: false,
        hasPassword: true,
      },
    ])
  } finally {
    sqlite.close()
  }
})
