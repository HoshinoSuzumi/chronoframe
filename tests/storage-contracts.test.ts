import assert from 'node:assert/strict'
import test from 'node:test'
import { storageConfigSchema } from '@chronoframe/contracts/storage'
import { storageConfigSchema as compatibilitySchema } from '../packages/gallery/shared/types/storage.ts'

// Exercise the workspace export as a plain Node consumer, outside Nuxt.
test('Self-hosted compatibility entry uses the shared storage schema', () => {
  assert.equal(compatibilitySchema, storageConfigSchema)
  assert.deepEqual(
    storageConfigSchema.parse({
      provider: 's3',
      bucket: 'photos',
      endpoint: 'https://s3.example.com',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    }),
    {
      provider: 's3',
      bucket: 'photos',
      endpoint: 'https://s3.example.com',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      region: 'auto',
      prefix: '/photos',
    },
  )
})

test('Local and OpenList retain Self-hosted configuration support', () => {
  assert.deepEqual(
    storageConfigSchema.parse({ provider: 'local', basePath: '/data/photos' }),
    { provider: 'local', basePath: '/data/photos' },
  )
  const openList = storageConfigSchema.parse({
    provider: 'openlist',
    baseUrl: 'https://files.example.com',
    rootPath: '/photos',
    token: 'test-token',
  })
  assert.equal(openList.provider, 'openlist')
  if (openList.provider === 'openlist') {
    assert.equal(openList.uploadEndpoint, '/api/fs/put')
    assert.equal(openList.deleteEndpoint, '/api/fs/remove')
    assert.equal(openList.metaEndpoint, '/api/fs/get')
    assert.equal(openList.pathField, 'path')
  }
  assert.equal(
    storageConfigSchema.safeParse({ provider: 'local', basePath: '' }).success,
    false,
  )
  assert.equal(
    storageConfigSchema.safeParse({ provider: 'unknown' }).success,
    false,
  )
})
