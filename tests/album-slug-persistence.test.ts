import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { asc } from 'drizzle-orm'
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

test('only current album slugs conflict; historical and deleted slugs are reusable', async () => {
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
      redirectCode: 301,
    })
    assert.equal(statements.length, 1)
    statements.length = 0
    const current = resolveAlbumPath(db, DEFAULT_SITE, 'a-new-title')
    assert.equal(current?.isCanonical, true)
    assert.equal(current?.redirectCode, undefined)
    assert.equal(statements.length, 1)
    statements.length = 0
    const historical = resolveAlbumPath(db, DEFAULT_SITE, 'my-album')
    assert.equal(historical?.slug, 'a-new-title')
    assert.equal(historical?.redirectCode, 302)
    assert.equal(statements.length, 1)
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.albumId,
      first.id,
    )
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.isCurrent,
      false,
    )
    assert.equal(
      (await writer.update(second.id, { slug: 'my-album' }, access)).slug,
      'my-album',
    )
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.albumId,
      second.id,
    )
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.isCurrent,
      true,
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
      'my-album-1',
    )
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'my-album')?.slug,
      'my-album',
    )
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'my-album')?.isCanonical,
      true,
    )
    assert.equal(
      resolveAlbumPath(db, DEFAULT_SITE, 'a-new-title')?.slug,
      'my-album-1',
    )

    assert.equal(
      (await writer.update(first.id, { slug: 'a-new-title' }, access)).slug,
      'a-new-title',
    )
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'a-new-title')?.isCurrent,
      true,
    )
    await assert.rejects(
      writer.update(second.id, { slug: 'Invalid Slug' }, access),
      (error) => error instanceof CoreError && error.statusCode === 400,
    )
    await writer.delete(first.id, access)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'my-album-1'), undefined)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'a-new-title'), undefined)
    assert.equal(
      (await writer.update(second.id, { slug: 'a-new-title' }, access)).slug,
      'a-new-title',
    )
    const replacement = await writer.create({ title: 'My Album 1' }, access)
    assert.equal(replacement.slug, 'my-album-1')
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album-1')?.albumId,
      replacement.id,
    )
    const reusedHistory = await writer.create({ title: 'My Album' }, access)
    assert.equal(reusedHistory.slug, 'my-album')
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.isCurrent,
      true,
    )
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'my-album')?.albumId,
      reusedHistory.id,
    )
  } finally {
    sqlite.close()
  }
})

test('untransliteratable titles use a stable album-id slug', async () => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './packages/database/migrations' })
  try {
    const writer = createAlbumWriter({
      repository: createSqliteAlbumWriteRepository(db, DEFAULT_SITE),
      clock: { now: () => new Date() },
      hashPassword: async (value) => value,
    })
    const album = await writer.create({ title: '🎉' }, access)
    assert.equal(album.slug, `album-${album.id}`)
    assert.equal(
      (await writer.update(album.id, { slug: '' }, access)).slug,
      `album-${album.id}`,
    )
  } finally {
    sqlite.close()
  }
})

test('editing a slug-less album claims a slug from its updated or existing title', async () => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './packages/database/migrations' })
  try {
    const writer = createAlbumWriter({
      repository: createSqliteAlbumWriteRepository(db, DEFAULT_SITE),
      clock: { now: () => new Date() },
      hashPassword: async (value) => value,
    })
    const [first, second] = db
      .insert(schema.albums)
      .values([{ title: 'Old Title' }, { title: 'Existing Title' }])
      .returning({ id: schema.albums.id })
      .all()
    assert.equal(getCurrentAlbumSlug(db, DEFAULT_SITE, first!.id), null)
    assert.deepEqual(resolveAlbumPath(db, DEFAULT_SITE, String(first!.id)), {
      albumId: first!.id,
      slug: String(first!.id),
      isCanonical: true,
      isHidden: false,
    })

    const updated = await writer.update(
      first!.id,
      { title: 'New Title' },
      access,
    )
    assert.equal(updated.slug, 'new-title')
    assert.equal(getCurrentAlbumSlug(db, DEFAULT_SITE, first!.id), 'new-title')
    assert.equal(
      (await writer.update(second!.id, { description: 'Edited' }, access)).slug,
      'existing-title',
    )
    assert.equal(
      getCurrentAlbumSlug(db, DEFAULT_SITE, second!.id),
      'existing-title',
    )
    assert.equal(
      (await writer.update(first!.id, { description: 'Edited' }, access)).slug,
      'new-title',
    )
  } finally {
    sqlite.close()
  }
})

test('migration replaces tombstones and retains live slug history', () => {
  const oldMigrations = mkdtempSync(join(tmpdir(), 'album-slugs-0020-'))
  cpSync('./packages/database/migrations', oldMigrations, { recursive: true })
  rmSync(join(oldMigrations, '0021_reusable_album_slugs.sql'))
  const journalPath = join(oldMigrations, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  journal.entries.pop()
  writeFileSync(journalPath, JSON.stringify(journal))
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  try {
    migrate(db, { migrationsFolder: oldMigrations })
    db.insert(schema.albums)
      .values([{ title: 'Keep' }, { title: 'Delete' }])
      .run()
    sqlite.exec(`
      INSERT INTO album_slugs (site_id, slug, album_id, is_current)
      VALUES (1, 'keep', 1, 1), (1, 'old-keep', 1, 0), (1, 'delete', 2, 1);
      DELETE FROM albums WHERE id = 2;
    `)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'delete')?.albumId, null)

    migrate(db, { migrationsFolder: './packages/database/migrations' })
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'delete'), undefined)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'keep')?.albumId, 1)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'old-keep')?.albumId, 1)
    assert.equal(
      resolveAlbumSlug(db, DEFAULT_SITE, 'old-keep')?.isCurrent,
      false,
    )
    const albumIdColumn = (
      sqlite.prepare("PRAGMA table_info('album_slugs')").all() as Array<{
        name: string
        notnull: number
      }>
    ).find((column) => column.name === 'album_id')
    assert.equal(albumIdColumn?.notnull, 1)
    assert.ok(
      (
        sqlite
          .prepare("PRAGMA foreign_key_list('album_slugs')")
          .all() as Array<{ on_delete: string }>
      ).some((foreignKey) => foreignKey.on_delete === 'CASCADE'),
    )

    sqlite.pragma('foreign_keys = OFF')
    sqlite.exec('DELETE FROM albums WHERE id = 1')
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'keep'), undefined)
    assert.equal(resolveAlbumSlug(db, DEFAULT_SITE, 'old-keep'), undefined)
  } finally {
    sqlite.close()
    rmSync(oldMigrations, { recursive: true, force: true })
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
        .orderBy(asc(schema.albumSlugs.slug))
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
