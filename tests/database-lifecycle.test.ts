import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  openDatabase,
  tables,
  persistenceErrorCode,
} from '../packages/database/src/connection.ts'
import {
  createSqliteResourceRepository,
  createSqliteAlbumWriteRepository,
} from '../packages/database/src/repositories.ts'

const migrationsFolder = './packages/database/migrations'
test('database connection, repositories, rollback, backup, restart and reentrant migrations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chronoframe-database-'))
  let connection = openDatabase({
    filename: join(root, 'app.sqlite3'),
    migrationsFolder,
  })
  try {
    const { db } = connection
    db.insert(tables.photos)
      .values([
        { id: 'a', title: null, dateTaken: '2020-01-01' },
        { id: 'b', title: 'newest', dateTaken: '2025-01-01' },
        { id: 'c', dateTaken: null },
      ])
      .run()
    const reader = createSqliteResourceRepository(db)
    assert.deepEqual(
      (await reader.listPhotos()).map((p) => p.id),
      ['b', 'a', 'c'],
    )
    assert.deepEqual(
      (await reader.listPhotos(['b'])).map((p) => p.id),
      ['a', 'c'],
    )
    assert.deepEqual(
      (await reader.listPhotos([], { limit: 1, offset: 1 })).map((p) => p.id),
      ['a'],
    )
    await assert.rejects(
      reader.listPhotos([], { limit: 0, offset: 0 }),
      RangeError,
    )
    const writer = createSqliteAlbumWriteRepository(db)
    const createdAt = new Date('2025-01-01T00:00:00Z')
    const album = await writer.createFirst(
      { title: 'fixture', createdAt, updatedAt: createdAt },
      ['a', 'b'],
    )
    assert.equal(album.createdAt, createdAt.toISOString())
    assert.deepEqual(await reader.listAlbumPhotoIds(album.id), ['a', 'b'])
    await assert.rejects(
      writer.createFirst(
        { title: 'rollback', createdAt, updatedAt: createdAt },
        ['missing'],
      ),
      (error) => persistenceErrorCode(error) === 'invalid-relation',
    )
    assert.equal((await reader.listAlbums()).length, 1)
    assert.throws(
      () => db.insert(tables.photos).values({ id: 'a' }).run(),
      (error) => persistenceErrorCode(error) === 'conflict',
    )
    await connection.backup(join(root, 'backup.sqlite3'))
    connection.close()
    connection = openDatabase({
      filename: join(root, 'app.sqlite3'),
      migrationsFolder,
    })
    assert.equal(connection.db.select().from(tables.photos).all().length, 3)
    const restored = openDatabase({
      filename: join(root, 'backup.sqlite3'),
      migrationsFolder,
    })
    try {
      assert.deepEqual(
        restored.db.select().from(tables.photos).all(),
        connection.db.select().from(tables.photos).all(),
      )
      assert.deepEqual(
        restored.db.select().from(tables.albumPhotos).all(),
        connection.db.select().from(tables.albumPhotos).all(),
      )
    } finally {
      restored.close()
    }
  } finally {
    connection.close()
    await rm(root, { recursive: true, force: true })
  }
})
