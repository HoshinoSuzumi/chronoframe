import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'
import { DEFAULT_SITE, siteCacheKey } from '@chronoframe/core'
import {
  openDatabase,
  tables,
  createSiteRepository,
  createSqliteResourceRepository,
  createSqliteAlbumWriteRepository,
  createSqlitePhotoWriteRepository,
  createSqliteUploadRepository,
} from '@chronoframe/database'

test('two sites isolate resource reads, writes, settings, objects, associations and job connections', async () => {
  const connection = openDatabase({
    filename: ':memory:',
    migrationsFolder: './packages/database/migrations',
  })
  try {
    const { db } = connection,
      second = { id: 2 }
    db.insert(tables.sites)
      .values({ id: 2, workspaceId: 1, name: 'Second' })
      .run()
    db.insert(tables.photos)
      .values([
        { id: 'first', siteId: 1, storageKey: 'same.jpg' },
        { id: 'second', siteId: 2, storageKey: 'same.jpg' },
      ])
      .run()
    const a = createSqliteResourceRepository(db, DEFAULT_SITE),
      b = createSqliteResourceRepository(db, second)
    assert.deepEqual(
      (await a.listPhotos()).map((p) => p.id),
      ['first'],
    )
    assert.deepEqual(
      (await b.listPhotos()).map((p) => p.id),
      ['second'],
    )
    const album = await createSqliteAlbumWriteRepository(
      db,
      second,
    ).createFirst({ title: 'Second album' }, ['second'])
    assert.equal(await a.getAlbum(album.id), null)
    assert.deepEqual(await a.listAlbumPhotos(album.id), [])
    assert.equal(
      await createSqliteAlbumWriteRepository(db, DEFAULT_SITE).update(
        album.id,
        { title: 'stolen' },
      ),
      null,
    )
    assert.equal(
      await createSqlitePhotoWriteRepository(db, DEFAULT_SITE).update(
        'second',
        { title: 'stolen' },
      ),
      null,
    )
    await createSqlitePhotoWriteRepository(db, DEFAULT_SITE).delete('second')
    assert.equal((await b.listPhotos()).length, 1)
    assert.equal(
      await createSqliteUploadRepository(db, DEFAULT_SITE).findDuplicate(
        'second',
      ),
      null,
    )
    await assert.rejects(
      createSqliteAlbumWriteRepository(db, DEFAULT_SITE).createFirst(
        { title: 'invalid' },
        ['second'],
      ),
    )
    assert.throws(() =>
      db
        .insert(tables.albumPhotos)
        .values({ albumId: album.id, photoId: 'first', siteId: 2 })
        .run(),
    )
    assert.throws(() =>
      db
        .update(tables.albums)
        .set({ coverPhotoId: 'first' })
        .where(eq(tables.albums.id, album.id))
        .run(),
    )
    assert.throws(() =>
      db
        .update(tables.photos)
        .set({ siteId: 1 })
        .where(eq(tables.photos.id, 'second'))
        .run(),
    )
    db.insert(tables.settings)
      .values([
        {
          siteId: 1,
          namespace: 'app',
          key: 'test',
          type: 'string',
          value: 'a',
        },
        {
          siteId: 2,
          namespace: 'app',
          key: 'test',
          type: 'string',
          value: 'b',
        },
      ])
      .run()
    assert.equal(
      (await createSiteRepository(db, DEFAULT_SITE).settings('app'))[0]?.value,
      'a',
    )
    assert.equal(
      (await createSiteRepository(db, second).settings('app'))[0]?.value,
      'b',
    )
    const provider = db
      .insert(tables.settings_storage_providers)
      .values({
        siteId: 2,
        name: 'fixture',
        provider: 'local',
        config: {
          provider: 'local',
          basePath: '/tmp/site-two',
          baseUrl: '/storage',
          prefix: '',
        },
      })
      .returning()
      .get()
    assert.equal(
      await createSiteRepository(db, DEFAULT_SITE).storageVersion(
        provider.id,
        1,
      ),
      null,
    )
    assert.throws(() =>
      db
        .insert(tables.pipelineQueue)
        .values({ siteId: 1, storageConnectionId: provider.id })
        .run(),
    )
    assert.throws(() =>
      db
        .insert(tables.photos)
        .values({
          id: 'cross-storage',
          siteId: 1,
          storageConnectionId: provider.id,
        })
        .run(),
    )
    db.update(tables.settings_storage_providers)
      .set({ config: { ...provider.config, basePath: '/tmp/site-two-new' } })
      .where(eq(tables.settings_storage_providers.id, provider.id))
      .run()
    assert.equal(
      (await createSiteRepository(db, second).storageVersion(provider.id, 1))
        ?.provider,
      'local',
    )
    assert.notDeepEqual(
      await createSiteRepository(db, second).storageVersion(provider.id, 1),
      await createSiteRepository(db, second).storageVersion(provider.id, 2),
    )
    assert.equal(
      await createSiteRepository(db, DEFAULT_SITE).photoReference('second'),
      null,
    )
    assert.notEqual(
      siteCacheKey(DEFAULT_SITE, 'resource'),
      siteCacheKey(second, 'resource'),
    )
    assert.throws(() => createSqliteResourceRepository(db, undefined as never))
    assert.throws(() => createSqliteResourceRepository(db, { id: 999 }))
  } finally {
    connection.close()
  }
})
