import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlatformAccess,
  normalizeSiteHost,
  platformCacheKey,
  hasSiteVisitorGrant,
  platformStateKey,
} from '../packages/core/src/platform.ts'
import type { PlatformDirectory } from '../packages/core/src/platform.ts'
const sites = [
  { id: 1, workspaceId: 10, published: true },
  { id: 2, workspaceId: 20, published: true },
]
const directory: PlatformDirectory = {
  async getSite(id) {
    return sites.find((site) => site.id === id) ?? null
  },
  async getMembership(userId, workspaceId) {
    return userId === 1 && workspaceId === 10
      ? { userId, workspaceId, role: 'admin' }
      : null
  },
  async getPublishedSiteByHost(host) {
    return host === 'one.example.com'
      ? sites[0]!
      : host === 'two.example.com'
        ? sites[1]!
        : null
  },
}
const access = createPlatformAccess(directory, () => 100)
const session = { userId: 1, expiresAt: 200 }
const status = (expected: number) => (error: unknown) =>
  (error as { statusCode?: number }).statusCode === expected

test('portal checks platform session and live Workspace membership for every Site request', async () => {
  assert.equal((await access.authorizeSite(session, 1, 'write')).site.id, 1)
  await assert.rejects(access.authorizeSite(session, 2, 'read'), status(404))
  await assert.rejects(access.authorizeSite(null, 1, 'read'), status(401))
  await assert.rejects(
    access.authorizeSite({ ...session, expiresAt: 100 }, 1, 'read'),
    status(401),
  )
  await assert.rejects(access.authorizeSite(session, -1, 'read'), status(404))
  const member = createPlatformAccess(
    {
      ...directory,
      async getMembership(userId, workspaceId) {
        return { userId, workspaceId, role: 'member' }
      },
    },
    () => 100,
  )
  assert.equal((await member.authorizeSite(session, 1, 'read')).role, 'member')
  await assert.rejects(member.authorizeSite(session, 1, 'write'), status(403))
  await assert.rejects(member.authorizeSite(session, 1, 'manage'), status(403))
})

test('revoked or mismatched membership and directory results cannot authorize a Site', async () => {
  for (const membership of [
    null,
    { userId: 2, workspaceId: 10, role: 'admin' as const },
    { userId: 1, workspaceId: 20, role: 'admin' as const },
  ]) {
    const resolver = createPlatformAccess(
      {
        ...directory,
        async getMembership() {
          return membership
        },
      },
      () => 100,
    )
    await assert.rejects(
      resolver.authorizeSite(session, 1, 'read'),
      status(404),
    )
  }
  const wrong = createPlatformAccess(
    {
      ...directory,
      async getSite() {
        return sites[1]!
      },
    },
    () => 100,
  )
  await assert.rejects(wrong.authorizeSite(session, 1, 'read'), status(404))
})

test('public resolution only accepts canonical DNS hosts with an active published mapping', async () => {
  assert.equal(normalizeSiteHost('ONE.Example.com.'), 'one.example.com')
  assert.equal((await access.resolvePublicSite('ONE.Example.com.')).site.id, 1)
  await assert.rejects(
    access.resolvePublicSite('unknown.example.com'),
    status(404),
  )
  const unpublished = createPlatformAccess({
    ...directory,
    async getPublishedSiteByHost() {
      return { ...sites[0]!, published: false }
    },
  })
  await assert.rejects(
    unpublished.resolvePublicSite('one.example.com'),
    status(404),
  )
  for (const host of [
    'https://one.example.com',
    'one.example.com:443',
    'one.example.com/evil',
    'one.example.com@evil.com',
    'one.example.com,evil.com',
    '*.example.com',
    '127.0.0.1',
    'one..example.com',
    '-bad.example.com',
    'one.example.com\n',
  ]) {
    assert.throws(() => normalizeSiteHost(host), status(400), host)
  }
})

test('cache, SSR and subscription keys separate Site, public Host, user and audience', async () => {
  const publicOne = await access.resolvePublicSite('one.example.com')
  const publicTwo = await access.resolvePublicSite('two.example.com')
  const portal = await access.authorizeSite(session, 1, 'read')
  const keys = [
    publicOne,
    publicTwo,
    portal,
    { ...portal, userId: 2 },
    { ...publicOne, host: 'alias.example.com' },
  ].map((context) => platformCacheKey(context, 'photos'))
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(platformStateKey(publicOne, 'photos'), keys[0])
  assert.throws(() => platformStateKey(publicOne, ''), status(400))
  assert.ok(Object.isFrozen(publicOne.site))
})

test('visitor grants cannot cross sites, albums, password revisions or expiry', async () => {
  const one = await access.resolvePublicSite('one.example.com')
  const two = await access.resolvePublicSite('two.example.com')
  const grants = [
    { siteId: 1, albumId: 5, revision: 'current', expiresAt: 200 },
  ]
  assert.equal(hasSiteVisitorGrant(one, grants, 5, 'current', 100), true)
  assert.equal(hasSiteVisitorGrant(two, grants, 5, 'current', 100), false)
  assert.equal(hasSiteVisitorGrant(one, grants, 6, 'current', 100), false)
  assert.equal(hasSiteVisitorGrant(one, grants, 5, 'rotated', 100), false)
  assert.equal(hasSiteVisitorGrant(one, grants, 5, 'current', 200), false)
})
