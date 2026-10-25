import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DEFAULT_SITE, createResourceReader } from '@chronoframe/core'
import { resolveAlbumPath } from '../packages/database/src/album-slugs.ts'
import { createSqliteResourceRepository } from '../packages/database/src/sqlite-resources.ts'
import * as schema from '../packages/database/src/schema.ts'
import { albumPagePath } from '../packages/gallery/shared/utils/albumPath.ts'

test('slug-less albums remain visible and use their numeric URL', async () => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './packages/database/migrations' })
  try {
    const album = db
      .insert(schema.albums)
      .values({ title: 'Missing Slug' })
      .returning({ id: schema.albums.id })
      .get()
    const reader = createResourceReader(
      createSqliteResourceRepository(db, DEFAULT_SITE),
    )
    const access = { admin: true, canAccess: () => true }

    const listed = (await reader.listAlbums(access)).find(
      (item) => item.id === album.id,
    )
    assert.ok(listed)
    assert.equal('slug' in listed, false)
    assert.equal(albumPagePath(listed, true), `/albums/${album.id}`)

    const detail = await reader.getAlbum(album.id, access)
    assert.equal(detail.id, album.id)
    assert.equal('slug' in detail, false)
    assert.equal(albumPagePath(detail, true), `/albums/${album.id}`)
    assert.deepEqual(resolveAlbumPath(db, DEFAULT_SITE, String(album.id)), {
      albumId: album.id,
      slug: String(album.id),
      isCanonical: true,
      isHidden: false,
    })
  } finally {
    sqlite.close()
  }
})
