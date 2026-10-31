import {
  createGeocodingServices,
  createGeocodingRateLimiter,
} from '@chronoframe/geocoding'
import { withRetry } from '@chronoframe/media'
import type { ProcessorGeocoding } from '@chronoframe/contracts/processor'
export function processingGeocoder(
  config: ProcessorGeocoding,
  signal: AbortSignal,
  reserve?: (intervalMs: number) => Promise<void>,
) {
  const logger = { info() {}, warn() {}, error() {}, success() {}, debug() {} }
  const localSlot = createGeocodingRateLimiter()
  const services = createGeocodingServices({
    getLanguage: async () => config.language,
    request: (url, init) =>
      fetch(url, {
        ...init,
        redirect: 'error',
        signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
      }),
    waitForGeocodingSlot: (key, interval, sig) =>
      reserve ? reserve(interval) : localSlot(key, interval, sig),
    withRetry,
    retryOptions: { maxAttempts: 3, timeout: 10000 },
    logger,
  })
  const provider =
    config.provider === 'mapbox'
      ? new services.MapboxGeocodingProvider(config.token)
      : config.provider === 'nominatim'
        ? new services.NominatimGeocodingProvider(config.endpoint)
        : null
  return {
    parseGPS: services.parseGPSCoordinates,
    reverseGeocode: async (lat: number, lon: number) => {
      signal.throwIfAborted()
      if (!provider) return null
      const result = await provider.reverseGeocode(lat, lon)
      signal.throwIfAborted()
      // Explicitly configured providers must succeed; do not silently publish incomplete locations.
      if (!result) throw new Error('reverse_geocoding_unavailable')
      return result
    },
  }
}
