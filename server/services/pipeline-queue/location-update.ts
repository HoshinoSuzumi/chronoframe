import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { and, eq, isNull } from 'drizzle-orm'
import { photos } from '../../database/schema.ts'
import type { Photo, useDB } from '../../utils/db.ts'
import type { LocationInfo } from '../location/geocoding.ts'

type LocationSnapshot = Pick<Photo, 'id' | 'latitude' | 'longitude'>

export function matchesLocationRequest(
  photo: LocationSnapshot,
  payload: { latitude?: number | null; longitude?: number | null },
) {
  return (
    (payload.latitude == null || payload.latitude === photo.latitude) &&
    (payload.longitude == null || payload.longitude === photo.longitude)
  )
}

// Compare the values read before the network call, including NULL. Resolved
// coordinates may come from EXIF and need not already exist in the database.
export function updateGeocodedPhoto(
  db: ReturnType<typeof useDB>,
  photo: LocationSnapshot,
  location: LocationInfo,
  migrationOnly: boolean,
) {
  return db
    .update(photos)
    .set({
      latitude: location.latitude,
      longitude: location.longitude,
      country: location.country ?? null,
      city: location.city ?? null,
      locationName: location.locationName ?? null,
      geocoding: location.geocoding,
    })
    .where(
      siteAnd(
        and(
          eq(photos.id, photo.id),
          photo.latitude == null
            ? isNull(photos.latitude)
            : eq(photos.latitude, photo.latitude),
          photo.longitude == null
            ? isNull(photos.longitude)
            : eq(photos.longitude, photo.longitude),
          migrationOnly ? isNull(photos.geocoding) : undefined,
        ),
        siteEq(photos.siteId, DEFAULT_SITE.id),
      ),
    )
    .run().changes
}
