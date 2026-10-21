import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeMapbox,
  normalizeNominatim,
} from '../apps/self-hosted/server/services/location/normalize.ts'
import {
  hasValidCoordinates,
  resolveLocationLabel,
} from '../packages/gallery/shared/utils/location.ts'
import { waitForGeocodingSlot } from '../apps/self-hosted/server/services/location/rate-limit.ts'

test('providers preserve city and district separately with source fields', () => {
  const mapbox = normalizeMapbox(
    {
      features: [
        {
          properties: {
            feature_type: 'address',
            name: 'Some street',
            context: {
              country: { name: 'France', country_code: 'fr' },
              region: { name: 'Île-de-France' },
              place: { name: 'Paris' },
              locality: { name: '9e arrondissement' },
            },
          },
        },
      ],
    },
    'fr',
  )!
  const nominatim = normalizeNominatim(
    {
      address: {
        country: 'France',
        country_code: 'fr',
        state: 'Île-de-France',
        city: 'Paris',
        city_district: '9e arrondissement',
      },
    },
    'fr',
  )!
  for (const geocoding of [mapbox, nominatim]) {
    assert.equal(geocoding.countryCode, 'FR')
    assert.equal(resolveLocationLabel({ geocoding }).label, 'Paris')
    assert.deepEqual(resolveLocationLabel({ geocoding }, 'district'), {
      label: '9e arrondissement',
      level: 'district',
    })
  }
  assert.equal(mapbox.components.district?.sourceField, 'context.locality')
  assert.equal(
    nominatim.components.district?.sourceField,
    'address.city_district',
  )
})

test('top-level Mapbox features contribute their own names', () => {
  const geocoding = normalizeMapbox(
    {
      features: [
        {
          properties: {
            feature_type: 'place',
            name: 'Hangzhou',
            context: { country: { name: 'China' } },
          },
        },
      ],
    },
    'en',
  )!
  assert.equal(geocoding.components.city?.name, 'Hangzhou')
  assert.equal(normalizeMapbox({ features: [] }, 'en'), null)
})

test('missing fields remain missing; preference changes do not need geocoding', () => {
  const geocoding = normalizeNominatim(
    {
      address: {
        country: '中国',
        state: '浙江省',
        district: '西湖区',
      },
    },
    'zh-CN',
  )!
  assert.equal(geocoding.components.city, undefined)
  assert.equal(resolveLocationLabel({ geocoding }).label, '浙江省')
  assert.equal(resolveLocationLabel({ geocoding }, 'district').label, '西湖区')
  assert.equal(
    resolveLocationLabel({ geocoding }, 'city', 'country,region').label,
    '中国',
  )
  assert.equal(
    resolveLocationLabel({ geocoding }, 'city', 'neighborhood').label,
    '',
  )
  assert.equal(resolveLocationLabel({ city: '旧位置' }).label, '旧位置')
})

test('county, settlements, and neighborhood aliases preserve distinct roles', () => {
  const geocoding = normalizeNominatim(
    {
      address: {
        country: 'United States',
        state: 'California',
        county: 'Marin County',
        town: 'Fairfax',
        suburb: 'Local area',
        neighbourhood: 'Neighborhood',
      },
    },
    'en',
  )!
  assert.equal(geocoding.components.subregion?.name, 'Marin County')
  assert.equal(geocoding.components.city?.sourceField, 'address.town')
  assert.equal(geocoding.components.district, undefined)
  assert.equal(geocoding.components.locality?.name, 'Local area')
  assert.equal(geocoding.components.neighborhood?.name, 'Neighborhood')
  assert.equal(normalizeNominatim({ error: 'not found' }, 'en'), null)
  assert.equal(normalizeNominatim({ address: {} }, 'en'), null)
})

test('coordinates preserve either zero axis but reject Null Island and invalid values', () => {
  assert.equal(hasValidCoordinates(0, 0), false)
  assert.equal(hasValidCoordinates(-0, 0), false)
  assert.equal(hasValidCoordinates(0, 121), true)
  assert.equal(hasValidCoordinates(31, 0), true)
  assert.equal(hasValidCoordinates(0, 0.000001), true)
  assert.equal(hasValidCoordinates(-90, 180), true)
  for (const [lat, lon] of [
    [NaN, 1],
    [1, Infinity],
    [91, 0],
    [0, -181],
    [null, 0],
  ]) {
    assert.equal(hasValidCoordinates(lat, lon), false)
  }
})

test('direct-administered municipalities use explicit subdivision codes', () => {
  const geocoding = normalizeNominatim(
    {
      address: {
        country: '中国',
        country_code: 'cn',
        state: '北京市',
        'ISO3166-2-lvl4': 'CN-BJ',
        city_district: '朝阳区',
      },
    },
    'zh-CN',
  )!
  assert.equal(resolveLocationLabel({ geocoding }).label, '北京市')
  assert.equal(geocoding.components.city?.sourceField, 'address.state')
  const ordinary = normalizeNominatim(
    {
      address: {
        country: '中国',
        country_code: 'cn',
        state: '浙江省',
        'ISO3166-2-lvl4': 'CN-ZJ',
      },
    },
    'zh-CN',
  )!
  assert.equal(ordinary.components.city, undefined)
})

test('parallel geocoding callers share request spacing', async () => {
  const start = Date.now()
  await Promise.all(
    Array.from({ length: 3 }, () => waitForGeocodingSlot('test-provider', 25)),
  )
  assert.ok(
    Date.now() - start >= 45,
    'requests must reserve distinct time slots',
  )
})
