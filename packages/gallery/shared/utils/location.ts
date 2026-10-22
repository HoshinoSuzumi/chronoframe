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
