import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createResourceReader,
  ResourceReadError,
  type ResourceReadRepository,
  type ReadAccess,
} from '@chronoframe/core'
import type { Album, Photo } from '@chronoframe/contracts/resources'
import { toPhotoDto } from '../apps/self-hosted/server/utils/dto.ts'
import type { Photo as PhotoRow } from '../apps/self-hosted/server/utils/db.ts'

const photos = ['public', 'shared-hidden', 'locked', 'shared-locked'].map(
  (id) =>
    toPhotoDto({
      id,
      storageKey: `${id}.jpg`,
      originalUrl: `/storage/${id}.jpg`,
      thumbnailUrl: `/storage/${id}.webp`,
      livePhotoVideoKey: `${id}.mp4`,
      livePhotoVideoUrl: `/storage/${id}.mp4`,
    } as PhotoRow),
)
const albums = [
  { id: 1, isHidden: false, hasPassword: false, coverPhotoId: 'shared-hidden' },
  { id: 2, isHidden: true, hasPassword: false, coverPhotoId: 'shared-hidden' },
  { id: 3, isHidden: false, hasPassword: true, coverPhotoId: 'locked' },
  { id: 4, isHidden: false, hasPassword: true, coverPhotoId: 'shared-locked' },
].map((resource) => ({
  resource: {
    title: 'Album',
    description: null,
    position: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...resource,
  } satisfies Album,
  passwordHash: resource.hasPassword ? 'private-hash' : null,
}))
const memberships = [
  { albumId: 1, photoId: 'public', hidden: false, protected: false },
  { albumId: 1, photoId: 'shared-hidden', hidden: false, protected: false },
  { albumId: 1, photoId: 'shared-locked', hidden: false, protected: false },
  { albumId: 2, photoId: 'shared-hidden', hidden: true, protected: false },
  { albumId: 3, photoId: 'shared-hidden', hidden: false, protected: true },
  { albumId: 3, photoId: 'locked', hidden: false, protected: true },
  { albumId: 3, photoId: 'shared-locked', hidden: false, protected: true },
  { albumId: 4, photoId: 'shared-locked', hidden: false, protected: true },
]
const repository: ResourceReadRepository = {
  async listPhotos(excludedIds = []) {
    return photos.filter((photo) => !excludedIds.includes(photo.id))
  },
  async listAlbums() {
    return albums
  },
  async getAlbum(id) {
    return albums.find((album) => album.resource.id === id) || null
  },
  async listMemberships() {
    return memberships
  },
  async listAlbumPhotoIds(id) {
    return memberships.filter((m) => m.albumId === id).map((m) => m.photoId)
  },
  async listAlbumPhotos(id) {
    return Promise.all(
      (await this.listAlbumPhotoIds(id)).map(async (id) =>
        photos.find((photo) => photo.id === id)!,
      ),
    )
  },
}
const reader = createResourceReader(repository)
const anonymous: ReadAccess = {
  admin: false,
  canAccess: (album) => !album.isHidden && !album.passwordHash,
}
const admin: ReadAccess = { admin: true, canAccess: () => true }
const unlocked: ReadAccess = {
  admin: false,
  canAccess: (album) => album.id === 3 || anonymous.canAccess(album),
}
const ids = (photos: Photo[]) => photos.map((photo) => photo.id)
const fails = (status: number) => (error: unknown) =>
  error instanceof ResourceReadError && error.statusCode === status

test('core read boundaries hide restricted membership from public feeds and listings', async () => {
  assert.deepEqual(ids(await reader.listVisiblePhotos()), ['public'])
  await assert.rejects(reader.listPhotos(anonymous), fails(401))
  assert.deepEqual(ids(await reader.listPhotos(admin)), ids(photos))
  const listed = await reader.listAlbums(anonymous)
  assert.deepEqual(
    listed.map((album) => album.id),
    [1, 3, 4],
  )
  assert.deepEqual(listed[0]!.photoIds, ['public'])
  assert.equal(listed[0]!.coverPhotoId, null)
  assert.equal(listed[1]!.coverPhotoId, null)
  assert.deepEqual(listed[1]!.photoIds, [])
  assert.equal('passwordHash' in listed[1]!, false)
  const all = await reader.listAlbums(admin)
  assert.equal(all.length, 4)
  assert.deepEqual(all[0]!.photoIds, [
    'public',
    'shared-hidden',
    'shared-locked',
  ])
})

test('album read authorization preserves hidden, locked and shared-photo rules', async () => {
  await assert.rejects(reader.getAlbum(999, anonymous), fails(404))
  await assert.rejects(reader.getAlbum(2, anonymous), fails(404))
  await assert.rejects(reader.getAlbum(3, anonymous), fails(403))
  assert.deepEqual(ids((await reader.getAlbum(1, anonymous)).photos), [
    'public',
  ])
  const result = await reader.getAlbum(3, unlocked)
  assert.deepEqual(ids(result.photos), ['locked', 'shared-locked'])
  assert.equal('passwordHash' in result, false)
  for (const photo of result.photos) {
    assert.equal('storageKey' in photo, false)
    assert.equal('thumbnailKey' in photo, false)
    assert.equal('livePhotoVideoKey' in photo, false)
    assert.equal(photo.originalUrl, `/image/__photo__/${photo.id}/original`)
  }
  assert.deepEqual(ids((await reader.getAlbum(2, admin)).photos), [
    'shared-hidden',
  ])
  assert.deepEqual(ids((await reader.getAlbum(3, admin)).photos), [
    'shared-hidden',
    'locked',
    'shared-locked',
  ])
})
