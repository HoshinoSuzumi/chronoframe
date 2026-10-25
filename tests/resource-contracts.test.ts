import assert from 'node:assert/strict'
import test from 'node:test'
import {
  toAlbumDto,
  toPhotoDto,
  toUserSummary,
} from '../apps/self-hosted/server/utils/dto.ts'
import type { Album, Photo, User } from '../apps/self-hosted/server/utils/db.ts'

test('user and album boundaries remove password material and serialize dates', () => {
  const date = new Date('2026-01-02T03:04:05Z')
  const user: User = {
    id: 1,
    username: 'owner',
    email: 'test@example.com',
    avatar: null,
    password: 'password-hash',
    isAdmin: 1,
    createdAt: date,
  }
  const summary = toUserSummary(user)
  assert.equal(summary.createdAt, date.toISOString())
  assert.equal('password' in summary, false)
  const album: Album = {
    id: 1,
    title: 'Test',
    description: null,
    coverPhotoId: null,
    isHidden: false,
    passwordHash: 'album-hash',
    position: 0,
    createdAt: date,
    updatedAt: date,
  }
  const dto = toAlbumDto(album, 'test')
  assert.equal(dto.slug, 'test')
  assert.equal(dto.hasPassword, true)
  assert.equal('passwordHash' in dto, false)
  assert.equal(dto.createdAt, date.toISOString())
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto)
  assert.equal('slug' in toAlbumDto(album, null), false)
})

test('photo boundary excludes future internal columns without changing nullable fields', () => {
  const nullable = [
    'title',
    'description',
    'width',
    'height',
    'aspectRatio',
    'dateTaken',
    'storageKey',
    'thumbnailKey',
    'fileSize',
    'lastModified',
    'originalUrl',
    'thumbnailUrl',
    'thumbnailHash',
    'tags',
    'exif',
    'latitude',
    'longitude',
    'country',
    'city',
    'locationName',
    'geocoding',
    'livePhotoVideoUrl',
    'livePhotoVideoKey',
  ]
  const photo = {
    ...Object.fromEntries(nullable.map((key) => [key, null])),
    id: 'photo-1',
    isLivePhoto: 0,
    internalSecret: 'not-an-api-field',
  } as unknown as Photo
  const dto = toPhotoDto(photo)
  assert.equal(dto.id, 'photo-1')
  assert.equal(dto.exif, null)
  assert.equal('internalSecret' in dto, false)
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto)
})
