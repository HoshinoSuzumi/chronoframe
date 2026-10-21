import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import sharp from 'sharp'
import { DEFAULT_SITE } from '@chronoframe/core'
import { openDatabase, tables, reserveResource } from '@chronoframe/database'

const require = createRequire(import.meta.url)
function load(
  file: string,
  modules: Record<string, unknown>,
  globals: Record<string, unknown> = {},
) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const exports = {}
  vm.runInNewContext(
    code,
    {
      exports,
      require: (name: string) =>
        name in modules ? modules[name] : require(name),
      Buffer,
      ...globals,
    },
    { filename: file },
  )
  return exports as Record<string, any>
}

test('Live Photo companion reservation leaves the image generation unchanged', async () => {
  const connection = openDatabase({
    filename: ':memory:',
    migrationsFolder: 'packages/database/migrations',
  })
  try {
    reserveResource(connection.db, DEFAULT_SITE, 'IMG', {
      storageKey: 'IMG.HEIC',
      storageConnectionId: null,
      storageRevision: 1,
    })
    const source = load('server/utils/upload-source.ts', {
      './db': { useDB: () => connection.db, tables },
      './file-utils': { generateSafePhotoId: () => 'IMG' },
      './object-storage': {
        storageForReference: () => {
          throw new Error('unexpected provider lookup')
        },
      },
    })
    const before = connection.db.select().from(tables.resourceVersions).all()
    source.reserveUploadSource('IMG.MOV', {})
    source.reserveUploadSource('IMG.mp4', {})
    assert.deepEqual(
      connection.db.select().from(tables.resourceVersions).all(),
      before,
    )
  } finally {
    connection.close()
  }
})

test('non-local thumbnails read app-relative keys through the provider after authorization', async () => {
  const jpeg = await sharp({
    create: { width: 2, height: 3, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer()
  const calls: string[] = []
  const route = load(
    'server/routes/thumb/[...thumbnailUrl].get.ts',
    {
      '../../utils/object-storage': {},
      '../../utils/local-media': {},
      '../../utils/db': {},
      '../../utils/album-access': {
        assertPhotoAccess: async (_event: unknown, key: string) => {
          calls.push('authorize:' + key)
          return true
        },
      },
    },
    {
      eventHandler: (handler: unknown) => handler,
      useStorageProvider: () => ({
        storageProvider: {
          config: { provider: 's3' },
          get: async (key: string) => {
            calls.push('get:' + key)
            return jpeg
          },
        },
      }),
      getRouterParam: () => encodeURIComponent('/image/photos/test.jpg'),
      setHeader: () => {},
      fetch: () => {
        throw new Error('must not fetch relative URL')
      },
    },
  ).default
  const output = await route({})
  assert.equal((await sharp(output).metadata()).width, 2)
  assert.ok(
    calls.indexOf('authorize:photos/test.jpg') <
      calls.indexOf('get:photos/test.jpg'),
  )
})

test('single and batch manual retries discard stale bindings and adopt the current source', async () => {
  const { createSqliteJobRepository } = await import('@chronoframe/database')
  for (const path of ['retry.post.ts', 'retry-batch.post.ts']) {
    const connection = openDatabase({
      filename: ':memory:',
      migrationsFolder: 'packages/database/migrations',
    })
    try {
      const db = connection.db
      const repository = createSqliteJobRepository(
        db,
        DEFAULT_SITE,
        () => 'photo',
      )
      repository.enqueue({ type: 'photo', storageKey: 'source.jpg' })
      const now = new Date()
      const lease = (await repository.claim('old', now, 60000))!
      repository.bindSourceHash(lease, 'a'.repeat(64), now)
      await repository.fail(lease, 'failed', false, now)
      reserveResource(db, DEFAULT_SITE, 'photo', {
        storageKey: 'source.jpg',
        storageConnectionId: null,
        storageRevision: 1,
      })
      const route = load(
        'server/api/queue/task/' + path,
        {},
        {
          defineEventHandler: (handler: unknown) => handler,
          requireUserSession: async () => ({ user: { isAdmin: true } }),
          readValidatedBody: async () => ({
            taskId: lease.id,
            taskIds: [lease.id],
          }),
          useDB: () => db,
          tables,
          console,
          createError: (options: object) =>
            Object.assign(new Error('HTTP error'), options),
        },
      ).default
      await route({})
      const reset = db.select().from(tables.pipelineQueue).get()!
      for (const key of [
        'resourceId',
        'sourceHash',
        'attemptId',
        'workerId',
        'leaseExpiresAt',
      ] as const)
        assert.equal(reset[key], null)
      const retry = (await repository.claim(
        'new',
        new Date(Date.now() + 1000),
        60000,
      ))!
      assert.ok(retry)
      assert.ok(retry.sourceVersion > lease.sourceVersion)
      assert.equal(retry.attempts, 1)
      repository.bindSourceHash(
        retry,
        'b'.repeat(64),
        new Date(Date.now() + 1000),
      )
    } finally {
      connection.close()
    }
  }
})

test('upload reservation failure creates no provider plan and duplicate skip never reserves', async () => {
  let plans = 0,
    reservations = 0,
    duplicate = false
  const route = load(
    'server/api/photos/index.post.ts',
    {
      '../../utils/upload-source': {
        reserveUploadSource: () => {
          reservations++
          throw new Error('unregistered')
        },
        sourceAwareUploadStorage: (provider: unknown) => provider,
      },
      '../../utils/useStorageProvider': {
        useStorageProvider: () => ({
          storageProvider: { config: { provider: 's3' } },
        }),
      },
      '../../utils/file-utils': { generateSafePhotoId: () => 'photo' },
      '../../services/settings/settingsManager': {
        settingsManager: { get: async () => undefined },
      },
      '../../utils/direct-upload': {
        prepareUpload: async () => {
          plans++
          return { mode: 'single', url: '/upload' }
        },
      },
      '../../utils/db': { useDB: () => ({}) },
      '../../repositories/sqlite-uploads': {
        createSqliteUploadRepository: () => ({
          findDuplicate: async () =>
            duplicate ? { id: 'photo', storageKey: 'p.jpg' } : null,
        }),
      },
    },
    {
      eventHandler: (handler: unknown) => handler,
      requireUserSession: async () => ({ user: { id: 1 } }),
      useTranslation: async () => (key: string) => key,
      readBody: async () => ({
        fileName: 'p.jpg',
        fileSize: 2,
        contentType: 'image/jpeg',
      }),
      useRuntimeConfig: () => ({
        upload: { mime: { whitelistEnabled: false, whitelist: '' } },
      }),
      logger: { chrono: { error: () => {} } },
      createError: (options: object) =>
        Object.assign(new Error('HTTP error'), options),
    },
  ).default
  await assert.rejects(route({}), { statusCode: 500 })
  assert.equal(plans, 0)
  assert.equal(reservations, 1)
  duplicate = true
  assert.equal((await route({})).skipped, true)
  assert.equal(reservations, 1)
})

test('Live Photo management preserves missing photo and source conflict responses', async () => {
  const { CoreError } = await import('@chronoframe/core')
  for (const status of [404, 409]) {
    const route = load(
      'server/api/photos/livephoto/manage.post.ts',
      {
        '@chronoframe/database': {
          createSiteRepository: () => ({
            capturePhoto: async () => {
              if (status === 409)
                throw new CoreError(409, 'Photo source changed')
              return null
            },
          }),
        },
        '../../../utils/object-storage': {},
        '~~/server/services/video/scanner': {},
        '~~/server/services/video/livephoto': {},
        '~~/server/plugins/3.storage': {},
        '~~/server/services/video/test-utils': {},
      },
      {
        eventHandler: (handler: unknown) => handler,
        requireUserSession: async () => ({}),
        readBody: async () => ({ action: 'update-photo', photoId: 'photo' }),
        useDB: () => ({}),
        logger: { chrono: { error: () => {} } },
        createError: (options: object) =>
          Object.assign(new Error('HTTP error'), options),
      },
    ).default
    await assert.rejects(route({}), { statusCode: status })
  }
})

test('native metadata editing stages a unique object and discard preserves original bytes', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { LocalStorageProvider } = await import('@chronoframe/storage')
  const { exiftool } = await import('exiftool-vendored')
  const root = await mkdtemp(join(tmpdir(), 'metadata-publication-'))
  try {
    const provider = new LocalStorageProvider({
      provider: 'local',
      basePath: root,
      prefix: 'photos',
    })
    const original = await sharp({
      create: { width: 2, height: 3, channels: 3, background: 'blue' },
    })
      .jpeg()
      .toBuffer()
    await provider.create('photo.jpg', original)
    const adapter = load('server/services/resources/photo-metadata.ts', {
      '../image/exif': { extractExifData: async () => null },
      '../../utils/logger': {
        logger: { image: { error: () => {}, warn: () => {} } },
      },
    }).editPhotoMetadata
    const staged = await adapter(
      { storageKey: 'photos/photo.jpg' },
      { title: 'Staged title' },
      provider,
    )
    assert.notEqual(staged.storageKey, 'photos/photo.jpg')
    assert.ok(staged.storageKey.startsWith('photos/.generated/metadata/'))
    assert.deepEqual(await provider.get('photos/photo.jpg'), original)
    const bytes = (await provider.get(staged.storageKey))!
    assert.ok(bytes.length > original.length)
    assert.equal((await sharp(bytes).metadata()).width, 2)
    await staged.discard()
    assert.equal(await provider.get(staged.storageKey), null)
    assert.deepEqual(await provider.get('photos/photo.jpg'), original)
  } finally {
    await exiftool.end()
    await rm(root, { recursive: true, force: true })
  }
})

test('S3 metadata publication uses image MIME and the returned prefixed key for both cleanup paths', async () => {
  const { S3StorageProvider } = await import('@chronoframe/storage')
  const original = await sharp({
    create: { width: 2, height: 3, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer()
  for (const failAfterCreate of [false, true]) {
    const provider = new S3StorageProvider({
      provider: 's3',
      bucket: 'test',
      region: 'us-east-1',
      prefix: 'photos',
      endpoint: 'https://storage.example.com',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    })
    const objects = new Map<string, Buffer>([['photos/original.JPG', original]])
    const writes: { Key: string; ContentType: string }[] = []
    const deletes: string[] = []
    ;(provider as any).client.send = async (command: any) => {
      const input = command.input
      if (command.constructor.name === 'GetObjectCommand')
        return {
          Body: { transformToByteArray: async () => objects.get(input.Key)! },
        }
      if (command.constructor.name === 'PutObjectCommand') {
        writes.push(input)
        objects.set(input.Key, input.Body)
        return {}
      }
      if (command.constructor.name === 'DeleteObjectCommand') {
        deletes.push(input.Key)
        objects.delete(input.Key)
        return {}
      }
      throw new Error('Unexpected S3 command')
    }
    if (failAfterCreate)
      provider.getPublicUrl = () => {
        throw new Error('URL construction failed')
      }
    const adapter = load('server/services/resources/photo-metadata.ts', {
      '../image/exif': { extractExifData: async () => null },
      '../../utils/logger': {
        logger: { image: { error: () => {}, warn: () => {} } },
      },
    }).editPhotoMetadata
    if (failAfterCreate)
      await assert.rejects(
        adapter({ storageKey: 'photos/original.JPG' }, {}, provider),
        /Failed to update photo metadata/,
      )
    else {
      const staged = await adapter(
        { storageKey: 'photos/original.JPG' },
        {},
        provider,
      )
      assert.equal(staged.storageKey, writes[0]!.Key)
      await staged.discard()
    }
    assert.equal(writes.length, 1)
    assert.equal(writes[0]!.ContentType, 'image/jpeg')
    assert.ok(writes[0]!.Key.startsWith('photos/.generated/metadata/'))
    assert.deepEqual(deletes, [writes[0]!.Key])
    assert.deepEqual([...objects.keys()], ['photos/original.JPG'])
    assert.deepEqual(objects.get('photos/original.JPG'), original)
  }
})
