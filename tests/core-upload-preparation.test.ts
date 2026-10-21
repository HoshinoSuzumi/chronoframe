import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CoreError,
  DuplicateUploadError,
  createUploadPreparer,
  canReadAlbum,
  photoAccessDenied,
  type UploadPolicy,
} from '@chronoframe/core'

const policy: UploadPolicy = {
  prefix: 'photos///',
  maxBytes: 10,
  mimeWhitelistEnabled: true,
  mimeWhitelist: ['image/jpeg'],
  duplicateCheckEnabled: true,
  duplicateMode: 'skip',
}
const duplicate = {
  id: 'photo',
  title: null,
  storageKey: 'photos/p.jpg',
  originalUrl: '/image',
  thumbnailUrl: '/thumb',
  dateTaken: null,
}

test('upload preparation rejects invalid size, MIME, names and quota before creating sessions', async () => {
  let prepared = 0
  const prepare = createUploadPreparer({
    repository: { findDuplicate: async () => null },
    identifiers: { fromStorageKey: () => 'photo' },
    quota: { assertAllowed: async () => {} },
    prepare: async () => {
      prepared++
      return { mode: 'single', url: '/upload' }
    },
  })
  for (const input of [
    { fileName: '../escape.jpg' },
    { fileName: 'p.jpg' },
    { fileName: '..\\escape.jpg', fileSize: 2, contentType: 'image/jpeg' },
    { contentType: 'image/jpeg', fileName: 'p.jpg', fileSize: 0 },
    { contentType: 'image/jpeg', fileName: 'p.jpg', fileSize: 11 },
    {
      fileName: 'p.jpg',
      fileSize: 2,
      contentType: 'text/plain',
    },
    { fileName: '../p.jpg', fileSize: 2, contentType: 'image/jpeg' },
  ]) {
    await assert.rejects(
      prepare('owner', input, policy),
      (error: unknown) => error instanceof CoreError,
    )
  }
  assert.equal(prepared, 0)
  const blocked = createUploadPreparer({
    repository: { findDuplicate: async () => null },
    identifiers: { fromStorageKey: () => 'photo' },
    quota: {
      assertAllowed: async () => {
        throw new CoreError(403, 'Quota exhausted')
      },
    },
    prepare: async () => {
      throw new Error('must not prepare')
    },
  })
  await assert.rejects(
    blocked(
      'owner',
      { fileSize: 2, contentType: 'image/jpeg', fileName: 'p.jpg' },
      policy,
    ),
    /Quota exhausted/,
  )
})

test('duplicate skip, block and warning preserve keys and avoid unwanted provider calls', async () => {
  const prepared: string[] = []
  const prepare = createUploadPreparer({
    repository: { findDuplicate: async () => duplicate },
    identifiers: { fromStorageKey: () => 'photo' },
    quota: { assertAllowed: async () => {} },
    prepare: async (_owner, key) => {
      prepared.push(key)
      return { mode: 'single', url: '/upload' }
    },
  })
  const skipped = await prepare(
    'owner',
    { fileSize: 2, contentType: 'image/jpeg', fileName: 'p.jpg' },
    policy,
  )
  assert.equal(skipped.skipped, true)
  assert.equal(skipped.fileKey, 'photos/p.jpg')
  assert.deepEqual(prepared, [])
  await assert.rejects(
    prepare(
      'owner',
      { fileSize: 2, contentType: 'image/jpeg', fileName: 'p.jpg' },
      { ...policy, duplicateMode: 'block' },
    ),
    (error: unknown) =>
      error instanceof DuplicateUploadError &&
      error.existingPhoto.id === 'photo',
  )
  const warning = await prepare(
    'owner',
    { fileSize: 2, contentType: 'image/jpeg', fileName: 'p.jpg' },
    { ...policy, duplicateMode: 'warn' },
  )
  assert.equal(warning.skipped, false)
  assert.equal(warning.existingPhoto!.id, 'photo')
  const ignored = await prepare(
    'owner',
    {
      fileSize: 2,
      contentType: 'image/jpeg',
      fileName: 'p.jpg',
      skipDuplicateCheck: true,
    },
    policy,
  )
  assert.equal(ignored.existingPhoto, null)
  const video = await prepare(
    'owner',
    { fileName: 'p.mov', fileSize: 2, contentType: 'image/jpeg' },
    policy,
  )
  assert.equal(video.skipped, false)
  assert.equal(video.existingPhoto, null)
})

test('protected access requires current grants and hidden membership wins', () => {
  const publicAlbum = { id: 1, isHidden: false, passwordHash: null }
  const protectedAlbum = { id: 2, isHidden: false, passwordHash: 'hash' }
  const hiddenAlbum = { id: 3, isHidden: true, passwordHash: null }
  assert.equal(
    canReadAlbum(publicAlbum, false, () => false),
    true,
  )
  assert.equal(
    canReadAlbum(protectedAlbum, false, () => false),
    false,
  )
  assert.equal(
    canReadAlbum(protectedAlbum, false, () => true),
    true,
  )
  assert.equal(
    canReadAlbum(hiddenAlbum, false, () => true),
    false,
  )
  assert.equal(
    photoAccessDenied(
      false,
      [{ album: protectedAlbum }, { album: hiddenAlbum }],
      () => true,
    ),
    true,
  )
  assert.equal(
    photoAccessDenied(false, [{ album: protectedAlbum }], () => true),
    false,
  )
  assert.equal(
    photoAccessDenied(true, [{ album: hiddenAlbum }], () => false),
    false,
  )
})

test('batch preflight shares upload key and identifier rules without altering explicit storage keys', async () => {
  const { createDuplicateChecker } = await import('@chronoframe/core')
  const keys: string[] = []
  const check = createDuplicateChecker({
    identifiers: {
      fromStorageKey(key) {
        keys.push(key)
        return 'photo'
      },
    },
    find: async () => duplicate,
  })
  const results = await check(
    { fileNames: ['p.jpg'], storageKeys: ['original/key.jpg'] },
    'photos///',
  )
  assert.deepEqual(keys, ['photos/p.jpg', 'original/key.jpg'])
  assert.deepEqual(
    results.map((row) => row.exists),
    [true, true],
  )
  assert.equal(results[0]!.fileName, 'p.jpg')
  assert.equal('fileName' in results[1]!, false)
})
