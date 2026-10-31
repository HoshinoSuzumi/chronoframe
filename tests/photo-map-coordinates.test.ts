import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePhotoCoordinates } from '../packages/gallery/shared/utils/location.ts'

test('large and mini maps resolve legacy EXIF GPS with hemisphere references', () => {
  assert.deepEqual(
    resolvePhotoCoordinates({
      latitude: null,
      longitude: null,
      exif: {
        GPSLatitude: 31.2,
        GPSLongitude: 121.5,
      },
    }),
    { latitude: 31.2, longitude: 121.5 },
  )
  assert.deepEqual(
    resolvePhotoCoordinates({
      exif: {
        GPSLatitude: '33.8',
        GPSLongitude: '151.2',
        GPSLatitudeRef: 'S',
        GPSLongitudeRef: 'W',
      },
    }),
    { latitude: -33.8, longitude: -151.2 },
  )
})

test('persisted coordinates take precedence and absent or invalid GPS stays hidden', () => {
  assert.deepEqual(
    resolvePhotoCoordinates({
      latitude: 10,
      longitude: 20,
      exif: {
        GPSLatitude: 30,
        GPSLongitude: 40,
      },
    }),
    { latitude: 10, longitude: 20 },
  )
  for (const exif of [
    null,
    {},
    { GPSLatitude: 91, GPSLongitude: 20 },
    { GPSLatitude: 0, GPSLongitude: 0 },
    { GPSLatitude: 'invalid', GPSLongitude: 20 },
  ]) {
    assert.equal(resolvePhotoCoordinates({ exif }), null)
  }
})
