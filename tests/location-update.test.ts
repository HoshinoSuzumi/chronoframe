import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { photos } from '../apps/self-hosted/server/database/schema.ts'
import {
  matchesLocationRequest,
  updateGeocodedPhoto,
} from '../apps/self-hosted/server/services/pipeline-queue/location-update.ts'
import type { LocationInfo } from '../apps/self-hosted/server/services/location/geocoding.ts'
import { photosToMarkers } from '../packages/gallery/app/utils/clustering.ts'

const location: LocationInfo = {
  latitude: 31,
  longitude: 121,
  city: 'City',
  geocoding: {
    version: 1,
    provider: 'nominatim',
    language: 'en',
    components: {},
  },
}

test('EXIF recovery writes NULL coordinates; concurrent changes discard the result', () => {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite)
  migrate(db, {
    migrationsFolder: 'apps/self-hosted/server/database/migrations',
  })
  const typedDB = db as Parameters<typeof updateGeocodedPhoto>[0]
  try {
    db.insert(photos).values({ id: 'p' }).run()
    const snapshot = db.select().from(photos).get()!
    assert.equal(matchesLocationRequest(snapshot, {}), true)
    assert.equal(
      matchesLocationRequest(snapshot, { latitude: 31, longitude: 121 }),
      false,
      'a stale explicit payload must not restore erased coordinates',
    )
    assert.equal(updateGeocodedPhoto(typedDB, snapshot, location, false), 1)
    const located = db.select().from(photos).get()!
    assert.equal(located.latitude, 31)
    assert.equal(
      matchesLocationRequest(located, { latitude: 31, longitude: 121 }),
      true,
    )
    assert.equal(matchesLocationRequest(located, { latitude: 32 }), false)
    // Erasure while the provider request is in flight invalidates the snapshot.
    db.update(photos)
      .set({ latitude: null, longitude: null, geocoding: null })
      .run()
    assert.equal(updateGeocodedPhoto(typedDB, located, location, false), 0)
    assert.equal(db.select().from(photos).get()!.geocoding, null)
    db.update(photos).set({ latitude: 32, longitude: 121 }).run()
    assert.equal(updateGeocodedPhoto(typedDB, located, location, false), 0)
    // Migration must not overwrite a result another worker has already filled.
    db.update(photos).set({ latitude: 31, geocoding: location.geocoding }).run()
    assert.equal(updateGeocodedPhoto(typedDB, located, location, true), 0)
    db.delete(photos).where(eq(photos.id, 'p')).run()
    assert.equal(updateGeocodedPhoto(typedDB, located, location, false), 0)
  } finally {
    sqlite.close()
  }
})

test('map markers exclude existing Null Island placeholders but preserve either zero axis', () => {
  const input = [
    { id: 'placeholder', latitude: 0, longitude: 0 },
    { id: 'equator', latitude: 0, longitude: 121 },
    { id: 'meridian', latitude: 31, longitude: 0 },
  ] as Parameters<typeof photosToMarkers>[0]
  assert.deepEqual(
    photosToMarkers(input).map((p) => p.id),
    ['equator', 'meridian'],
  )
})
