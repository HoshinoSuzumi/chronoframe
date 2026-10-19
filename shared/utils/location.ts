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

export function hasValidCoordinates(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    typeof lon === 'number' &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180 &&
    // Exact (0, 0) is treated as a missing-GPS placeholder.
    !(lat === 0 && lon === 0)
  )
}
