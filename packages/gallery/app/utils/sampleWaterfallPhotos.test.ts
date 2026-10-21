import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleWaterfallPhotos } from './sampleWaterfallPhotos.ts'

test('selects at most 30 unique photos without mutating the collection', () => {
  const photos = Array.from({ length: 100 }, (_, id) => ({ id }))
  const originalOrder = photos.map((photo) => photo.id)

  const selected = sampleWaterfallPhotos(photos, 12345)

  assert.equal(selected.length, 30)
  assert.equal(new Set(selected.map((photo) => photo.id)).size, 30)
  assert.notDeepEqual(
    selected.map((photo) => photo.id),
    originalOrder.slice(0, 30),
  )
  assert.deepEqual(
    photos.map((photo) => photo.id),
    originalOrder,
  )
})

test('uses the seed consistently and varies the selection between seeds', () => {
  const photos = Array.from({ length: 60 }, (_, id) => ({ id }))

  assert.deepEqual(
    sampleWaterfallPhotos(photos, 12345),
    sampleWaterfallPhotos(photos, 12345),
  )
  assert.notDeepEqual(
    sampleWaterfallPhotos(photos, 12345),
    sampleWaterfallPhotos(photos, 67890),
  )
})

test('handles empty, small, and changed collections', () => {
  const photos = Array.from({ length: 12 }, (_, id) => ({ id }))

  assert.deepEqual(sampleWaterfallPhotos([], 12345), [])
  assert.deepEqual(
    new Set(sampleWaterfallPhotos(photos, 12345).map((photo) => photo.id)),
    new Set(photos.map((photo) => photo.id)),
  )

  const updated = photos.filter((photo) => photo.id !== 3)
  updated.push({ id: 12 })
  const selected = sampleWaterfallPhotos(updated, 12345)
  assert.equal(selected.length, updated.length)
  assert.equal(
    selected.some((photo) => photo.id === 3),
    false,
  )
  assert.equal(
    selected.some((photo) => photo.id === 12),
    true,
  )
})
