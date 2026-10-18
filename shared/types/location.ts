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
