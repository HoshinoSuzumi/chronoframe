export const locationLevels = [
  'country',
  'region',
  'subregion',
  'city',
  'district',
  'locality',
  'neighborhood',
] as const

export type LocationLevel = (typeof locationLevels)[number]

export interface LocationComponent {
  name: string
  sourceField: string
}

export interface NormalizedLocation {
  version: 1
  provider: 'mapbox' | 'nominatim'
  language: string
  countryCode?: string
  components: Partial<Record<LocationLevel, LocationComponent>>
  formattedAddress?: string
}

/** Accept finite, in-range coordinates while excluding the legacy Null Island placeholder. */
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
