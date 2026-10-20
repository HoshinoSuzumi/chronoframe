import type {
  LocationLevel,
  NormalizedLocation,
} from '@chronoframe/contracts/location'

type ObjectValue = Record<string, any>
const name = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const municipalityCodes = new Set(['CN-BJ', 'CN-TJ', 'CN-SH', 'CN-CQ'])

/** Reuse the regional component as the city for explicitly identified Chinese municipalities. */
function applyMunicipality(result: NormalizedLocation, code: unknown) {
  // A direct-administered municipality also acts as the city. Use the explicit
  // ISO subdivision code, rather than guessing from translated name suffixes.
  if (
    result.countryCode === 'CN' &&
    typeof code === 'string' &&
    municipalityCodes.has(code.toUpperCase()) &&
    !result.components.city
  ) {
    result.components.city = result.components.region
  }
}

/** Keep the first nonempty name for a location level and record its provider source field. */
function put(
  result: NormalizedLocation,
  level: LocationLevel,
  value: unknown,
  sourceField: string,
) {
  const text = name(value)
  if (text && !result.components[level])
    result.components[level] = { name: text, sourceField }
}

/** Normalize Mapbox features into location components while preserving source fields. */
export function normalizeMapbox(
  data: ObjectValue,
  language: string,
): NormalizedLocation | null {
  if (!Array.isArray(data?.features) || !data.features.length) return null
  const result: NormalizedLocation = {
    version: 1,
    provider: 'mapbox',
    language,
    components: {},
  }
  const mapping: Record<string, LocationLevel> = {
    country: 'country',
    region: 'region',
    district: 'subregion',
    place: 'city',
    locality: 'district',
    neighborhood: 'neighborhood',
  }
  for (const feature of data.features) {
    const p = feature.properties || {}
    const context = p.context || {}
    // A country/place response may carry its own name only on the feature.
    const level = mapping[p.feature_type]
    if (level) put(result, level, p.name, `feature.${p.feature_type}`)
    for (const [field, target] of Object.entries(mapping)) {
      put(result, target, context[field]?.name, `context.${field}`)
    }
    result.countryCode ||= name(context.country?.country_code)?.toUpperCase()
    if (p.feature_type === 'country')
      result.countryCode ||= name(p.country_code)?.toUpperCase()
    result.formattedAddress ||=
      name(p.full_address) || name(p.place_formatted) || name(p.name)
  }
  for (const feature of data.features) {
    const p = feature.properties || {}
    applyMunicipality(
      result,
      p.context?.region?.region_code_full ||
        (p.feature_type === 'region' ? p.region_code_full : undefined),
    )
  }
  return Object.keys(result.components).length ? result : null
}

/** Normalize Nominatim address tags without treating counties as city districts. */
export function normalizeNominatim(
  data: ObjectValue,
  language: string,
): NormalizedLocation | null {
  if (!data || data.error) return null
  const result: NormalizedLocation = {
    version: 1,
    provider: 'nominatim',
    language,
    components: {},
    countryCode: name(data.address?.country_code)?.toUpperCase(),
    formattedAddress: name(data.display_name),
  }
  // Preserve source tags: county/state_district must not be treated as city districts.
  const mapping: Array<[LocationLevel, string[]]> = [
    ['country', ['country']],
    ['region', ['state', 'region']],
    ['subregion', ['state_district', 'county']],
    ['city', ['city', 'town', 'municipality', 'village', 'hamlet']],
    ['district', ['city_district', 'district', 'borough']],
    ['locality', ['suburb', 'subdivision']],
    ['neighborhood', ['neighbourhood', 'quarter']],
  ]
  for (const [level, fields] of mapping) {
    for (const field of fields)
      put(result, level, data.address?.[field], `address.${field}`)
  }
  applyMunicipality(result, data.address?.['ISO3166-2-lvl4'])
  return Object.keys(result.components).length ? result : null
}
