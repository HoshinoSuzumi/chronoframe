import { hasValidCoordinates } from '@chronoframe/contracts/location'
import {
  locationLevels,
  type LocationLevel,
  type NormalizedLocation,
} from '../types/location.ts'

export const defaultLocationFallback = 'city,subregion,region,country'

export function parseLocationOrder(value: string): LocationLevel[] {
  return [...new Set(value.split(',').map((s) => s.trim()))].filter(
    (s): s is LocationLevel => locationLevels.includes(s as LocationLevel),
  )
}

export function resolveLocationLabel(
  photo: { geocoding?: NormalizedLocation | null; city?: string | null },
  preferred: string = 'city',
  fallback: string = defaultLocationFallback,
): { label: string; level?: LocationLevel } {
  if (!photo.geocoding) return { label: photo.city || '' }
  const order = parseLocationOrder(`${preferred},${fallback}`)
  for (const level of order) {
    const name = photo.geocoding.components[level]?.name.trim()
    if (name) return { label: name, level }
  }
  return { label: '' }
}

export { hasValidCoordinates } from '@chronoframe/contracts/location'

/** Resolve both persisted coordinates and legacy photos whose GPS exists only in EXIF. */
export function resolvePhotoCoordinates(photo: {
  latitude?: number | null
  longitude?: number | null
  exif?: {
    GPSLatitude?: unknown
    GPSLongitude?: unknown
    GPSLatitudeRef?: unknown
    GPSLongitudeRef?: unknown
  } | null
}): { latitude: number; longitude: number } | null {
  if (hasValidCoordinates(photo.latitude, photo.longitude)) {
    return { latitude: photo.latitude!, longitude: photo.longitude! }
  }
  const exif = photo.exif
  if (exif?.GPSLatitude == null || exif.GPSLongitude == null) return null
  let latitude = Number.parseFloat(String(exif.GPSLatitude))
  let longitude = Number.parseFloat(String(exif.GPSLongitude))
  if (exif.GPSLatitudeRef === 'S') latitude = -Math.abs(latitude)
  if (exif.GPSLongitudeRef === 'W') longitude = -Math.abs(longitude)
  return hasValidCoordinates(latitude, longitude)
    ? { latitude, longitude }
    : null
}
