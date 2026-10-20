import assert from 'node:assert/strict'
import test from 'node:test'
import { createGeocodingServices } from '@chronoframe/geocoding'
import { withRetry, RetryPresets } from '@chronoframe/media/retry'

const logger = { info() {}, warn() {}, error() {}, success() {} }

test('geocoding injects transport, language, retry and rate limiting without application settings', async () => {
  let language = 'fr'
  const requests: URL[] = []
  const slots: string[] = []
  const services = createGeocodingServices({
    getLanguage: async () => language,
    request: async (input) => {
      requests.push(new URL(String(input)))
      return new Response(
        JSON.stringify({
          address: { city: 'Paris', country: 'France', country_code: 'fr' },
          display_name: 'Paris, France',
        }),
        { status: 200 },
      )
    },
    waitForGeocodingSlot: async (key) => {
      slots.push(key)
    },
    withRetry,
    retryOptions: { ...RetryPresets.network, maxAttempts: 1 },
    logger,
  })
  const provider = new services.NominatimGeocodingProvider(
    'https://geo.example.com',
  )
  assert.equal((await provider.reverseGeocode(48.85, 2.35))?.city, 'Paris')
  language = 'de'
  assert.equal(
    (await provider.reverseGeocode(48.85, 2.35))?.geocoding.language,
    'de',
  )
  assert.deepEqual(
    requests.map((url) => url.searchParams.get('accept-language')),
    ['fr,en', 'de,en'],
  )
  assert.deepEqual(slots, [
    'https://geo.example.com',
    'https://geo.example.com',
  ])
  assert.deepEqual(
    services.parseGPSCoordinates({
      GPSLatitude: 48,
      GPSLongitude: 2,
      GPSLongitudeRef: 'W',
    }),
    { latitude: 48, longitude: -2 },
  )
  assert.deepEqual(
    services.parseGPSCoordinates({ GPSLatitude: 999, GPSLongitude: 2 }),
    {},
  )
})
