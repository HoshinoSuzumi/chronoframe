import { DEFAULT_SITE } from '@chronoframe/core'
import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createResourceReader } from '@chronoframe/core'
import * as schema from '../apps/self-hosted/server/database/schema.ts'
import { createSqliteResourceRepository } from '../apps/self-hosted/server/repositories/sqlite-resources.ts'
import { fetchAlbumPhotos } from '../apps/self-hosted/server/utils/album-visibility.ts'
import { backfillAlbumSlugs } from '../packages/database/src/album-slugs.ts'

test('SQLite reader preserves migrated data, ordering and legacy album visibility', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, {
    migrationsFolder: './apps/self-hosted/server/database/migrations',
  })
  try {
    db.insert(schema.photos)
      .values([
        { id: 'old', dateTaken: '2020-01-01', title: null },
        { id: 'new', dateTaken: '2026-01-01' },
        { id: 'hidden' },
        { id: 'locked' },
      ])
      .run()
    db.insert(schema.albums)
      .values([
        { id: 1, title: 'Public', position: 2 },
        { id: 2, title: 'Hidden', isHidden: true, position: 1 },
        { id: 3, title: 'Locked', passwordHash: 'private-hash', position: 0 },
      ])
      .run()
    backfillAlbumSlugs(db)
    db.insert(schema.albumPhotos)
      .values([
        { albumId: 1, photoId: 'old', position: 30 },
        { albumId: 1, photoId: 'new', position: 10 },
        { albumId: 1, photoId: 'hidden', position: 5 },
        { albumId: 1, photoId: 'locked', position: 20 },
        { albumId: 2, photoId: 'hidden', position: 0 },
        { albumId: 3, photoId: 'locked', position: 0 },
      ])
      .run()
    const reader = createResourceReader(
      createSqliteResourceRepository(db, DEFAULT_SITE),
    )
    const anonymous = {
      admin: false,
      canAccess: (album: { isHidden: boolean; passwordHash: string | null }) =>
        !album.isHidden && !album.passwordHash,
    }
    assert.deepEqual(
      (await reader.listPhotos({ admin: true }))
        .slice(0, 2)
        .map((photo) => photo.id),
      ['new', 'old'],
    )
    assert.deepEqual(
      (await reader.listAlbums(anonymous)).map((album) => album.id),
      [3, 1],
    )
    assert.deepEqual(
      (await reader.listVisiblePhotos()).map((photo) => photo.id),
      ['new', 'old'],
    )
    const listed = await reader.listAlbums(anonymous)
    assert.deepEqual(listed[1]!.photoIds, ['new', 'old'])
    assert.deepEqual(listed[0]!.photoIds, [])
    for (const [id, admin, unlocked] of [
      [1, false, false],
      [1, true, false],
      [3, false, true],
    ] as const) {
      const access = { admin, canAccess: () => admin || unlocked || id === 1 }
      const actual = await reader.getAlbum(id, access)
      const expected = await fetchAlbumPhotos(
        db,
        schema,
        id,
        admin,
        admin || id === 3,
      )
      assert.deepEqual(
        actual.photos.map((photo) => photo.id),
        expected.map((photo) => photo.id),
      )
      assert.equal('passwordHash' in actual, false)
    }
    assert.equal((await reader.getAlbum(1, anonymous)).photos[1]!.title, null)
    assert.equal(db.select().from(schema.photos).all().length, 4)
    db.insert(schema.albums)
      .values({ id: 4, title: 'Missing slug', position: 3 })
      .run()
    const sluglessListItem = (await reader.listAlbums({ admin: true })).find(
      (album) => album.id === 4,
    )
    assert.ok(sluglessListItem)
    assert.equal('slug' in sluglessListItem, false)
    const sluglessDetail = await reader.getAlbum(4, {
      admin: true,
      canAccess: () => true,
    })
    assert.equal('slug' in sluglessDetail, false)
  } finally {
    sqlite.close()
  }
})
