import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SELF_HOSTED_CAPABILITIES,
  CLOUD_CAPABILITIES,
  SITE_CAPABILITIES,
  entryRequestPath,
} from '../packages/contracts/src/entry.ts'
import {
  encodeVisitorGrants,
  decodeVisitorGrants,
  visitorPasswordHash,
} from '../apps/shared/platform/visitor.ts'
import { hasSiteVisitorGrant } from '../packages/core/src/platform.ts'

const secret = 'independent-site-test-secret-at-least-32-bytes'
test('entry capabilities keep Self-hosted providers/unlimited quota and disable unavailable SaaS media', () => {
  assert.deepEqual(SELF_HOSTED_CAPABILITIES.storageProviders, [
    'local',
    's3',
    'openlist',
  ])
  assert.equal(SELF_HOSTED_CAPABILITIES.quota, 'unlimited')
  assert.equal(SELF_HOSTED_CAPABILITIES.mediaManagement, true)
  assert.equal(CLOUD_CAPABILITIES.database, 'd1')
  assert.equal(CLOUD_CAPABILITIES.customScripts, false)
  assert.equal(SITE_CAPABILITIES.identity, 'visitor')
  assert.equal(SITE_CAPABILITIES.mediaManagement, false)
})
test('shared transport scopes API routes and rejects path traversal or foreign origins', () => {
  const context = {
    siteId: 7,
    scope: 'site:7',
    name: 'seven',
    published: true,
    audience: 'portal' as const,
    capabilities: CLOUD_CAPABILITIES,
  }
  assert.equal(
    entryRequestPath('/api/photos?offset=2', context),
    '/api/sites/7/photos?offset=2',
  )
  assert.equal(
    entryRequestPath('/api/albums/8/unlock', {
      ...context,
      audience: 'public',
    }),
    '/api/public/albums/8/unlock',
  )
  assert.equal(entryRequestPath('/api/photos', null), '/api/photos')
  for (const path of [
    'https://evil.example/api/photos',
    '//evil.example/api/photos',
    '/api/../auth',
    '/api/%2e%2e/auth',
    '/api/\\evil',
  ])
    assert.throws(() => entryRequestPath(path, context))
})
test('signed visitor grants reject another Host, Site, album, revision, expiry and tampering', async () => {
  const grants = [
    {
      siteId: 1,
      albumId: 3,
      revision: 'version-one',
      expiresAt: Date.now() + 60_000,
    },
  ]
  const token = await encodeVisitorGrants(secret, 'one.example.com', grants)
  const verified = await decodeVisitorGrants(secret, 'one.example.com', token)
  const context = {
    kind: 'public' as const,
    site: { id: 1, workspaceId: 1, published: true },
    host: 'one.example.com',
  }
  assert.equal(hasSiteVisitorGrant(context, verified, 3, 'version-one'), true)
  assert.equal(
    hasSiteVisitorGrant(
      { ...context, site: { ...context.site, id: 2 } },
      verified,
      3,
      'version-one',
    ),
    false,
  )
  assert.equal(hasSiteVisitorGrant(context, verified, 4, 'version-one'), false)
  assert.equal(hasSiteVisitorGrant(context, verified, 3, 'rotated'), false)
  assert.deepEqual(
    await decodeVisitorGrants(secret, 'two.example.com', token),
    [],
  )
  assert.deepEqual(
    await decodeVisitorGrants(secret, 'one.example.com', token + 'changed'),
    [],
  )
  const expired = await encodeVisitorGrants(secret, 'one.example.com', [
    { ...grants[0]!, expiresAt: Date.now() - 1 },
  ])
  assert.deepEqual(
    await decodeVisitorGrants(secret, 'one.example.com', expired),
    [],
  )
  assert.notEqual(
    await visitorPasswordHash('password', 'salt-one'),
    await visitorPasswordHash('password', 'salt-two'),
  )
})
