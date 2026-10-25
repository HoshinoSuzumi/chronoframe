import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DEFAULT_SITE, CoreError, createAlbumWriter } from '@chronoframe/core'
import * as schema from '../packages/database/src/schema.ts'
import {
  backfillAlbumSlugs,
  getCurrentAlbumSlug,
  resolveAlbumPath,
  resolveAlbumSlug,
} from '../packages/database/src/album-slugs.ts'
import { createSqliteAlbumWriteRepository } from '../packages/database/src/sqlite-mutations.ts'

const access = { authenticated: true }

test('album slugs remain unique, redirectable, and reserved after deletion', async () => {
  const statements: string[] = []
  const sqlite = new Database(':memory:', {
    verbose: (statement) => statements.push(statement),
  })
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './packages/database/migrations' })
  try {
    const writer = createAlbumWriter({
      repository: createSqliteAlbumWriteRepository(db, DEFAULT_SITE),
      clock: { now: () => new Date() },
      hashPassword: async (value) => value,
    })
    const first = await writer.create({ title: 'My Album' }, access)
    const second = await writer.create({ title: 'My Album' }, access)
    assert.equal(first.slug, 'my-album')
    assert.equal(second.slug, 'my-album-1')
    const site2 = db
      .insert(schema.sites)
      .values({ workspaceId: 1, name: 'Another site' })
      .returning({ id: schema.sites.id })
      .get()
    const otherWriter = createAlbumWriter({
      repository: createSqliteAlbumWriteRepository(db, { id: site2.id }),
      clock: { now: () => new Date() },
      hashPassword: async (value) => value,
    })
    assert.equal(
      (await otherWriter.create({ title: 'My Album' }, access)).slug,
      'my-album',
    )

    const renamed = await writer.update(
      first.id,
      { title: 'A New Title', slug: '' },
      access,
    )
    assert.equal(renamed.slug, 'a-new-title')
    statements.length = 0
    assert.deepEqual(resolveAlbumPath(db, DEFAULT_SITE, String(first.id)), {
      albumId: first.id,
      slug: 'a-new-title',
      isCanonical: false,
      isHidden: false,
    })
    assert.equal(statements.length, 1)
    statements.length = 0
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'a-new-title')?.isCanonical,
      true,
    )
    assert.equal(statements.length, 1)
    statements.length = 0
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'my-album')?.slug,
      'a-new-title',
    )
    assert.equal(statements.length, 1)
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.albumId,
      first.id,
    )
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.isCurrent,
      false,
    )
    await assert.rejects(
      writer.update(second.id, { slug: 'my-album' }, access),
      (error) => error instanceof CoreError && error.statusCode === 409,
    )
    assert.equal(
      (await writer.update(first.id, { title: 'Only Title' }, access)).slug,
      'a-new-title',
    )
    assert.equal(
      (await writer.update(first.id, { slug: 'a-new-title' }, access)).slug,
      'a-new-title',
    )
    await assert.rejects(
      writer.update(first.id, { slug: 'my-album' }, access),
      (error) => error instanceof CoreError && error.statusCode === 409,
    )
    assert.equal(
      (await writer.update(first.id, { title: 'My Album', slug: '' }, access))
        .slug,
      'my-album-2',
    )
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'my-album')?.slug,
      'my-album-2',
    )
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'my-album')?.isCanonical,
      false,
    )
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'a-new-title')?.slug,
      'my-album-2',
    )

    await assert.rejects(
      writer.update(second.id, { slug: 'my-album' }, access),
      (error) => error instanceof CoreError && error.statusCode === 409,
    )
    await assert.rejects(
      writer.update(second.id, { slug: 'Invalid Slug' }, access),
      (error) => error instanceof CoreError && error.statusCode === 400,
    )
    await writer.delete(first.id, access)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.albumId, null)
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'a-new-title')?.albumId,
      null,
    )
    assert.equal(
      (await writer.create({ title: 'My Album' }, access)).slug,
      'my-album-3',
    )
  } finally {
    sqlite.close()
  }
})

test('backfill assigns deterministic slugs once for existing rows', () => {
  const statements: string[] = []
  const sqlite = new Database(':memory:', {
    verbose: (statement) => statements.push(statement),
  })
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './packages/database/migrations' })
  try {
    db.insert(schema.albums)
      .values([{ title: '你好' }, { title: '你好' }])
      .run()
    assert.equal(getCurrentAlbumSlug(db, DEFAULT_SITE, 1), null)
    assert.deepEqual(resolveAlbumPath(db, DEFAULT_SITE, '1'), {
      albumId: 1,
      slug: '1',
      isCanonical: true,
      isHidden: false,
    })
    assert.equal(backfillAlbumSlugs(db), 2)
    statements.length = 0
    assert.equal(backfillAlbumSlugs(db), 0)
    assert.equal(statements.length, 1)
    assert.match(statements[0]!, /^select /i)
    assert.deepEqual(
      db
        .select()
        .from(schema.albumSlugs)
        .all()
        .map((row) => row.slug),
      ['ni-hao', 'ni-hao-1'],
    )
    db.insert(schema.albums).values({ title: '你好' }).run()
    assert.equal(backfillAlbumSlugs(db), 1)
    assert.equal(getCurrentAlbumSlug(db, DEFAULT_SITE, 3), 'ni-hao-2')
  } finally {
    sqlite.close()
  }
})
