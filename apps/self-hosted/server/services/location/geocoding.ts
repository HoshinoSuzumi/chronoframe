import { createGeocodingServices } from '@chronoframe/geocoding'
import type { GeocodingProvider, LocationInfo } from '@chronoframe/geocoding'
export type { GeocodingProvider, LocationInfo } from '@chronoframe/geocoding'
import { waitForGeocodingSlot } from './rate-limit'
import { hasValidCoordinates } from '#shared/utils/location'
import { withRetry, RetryPresets } from '../../utils/retry'
import { settingsManager } from '../settings/settingsManager'
import { logger } from '../../utils/logger'
export const {
  MapboxGeocodingProvider,
  NominatimGeocodingProvider,
  parseGPSCoordinates,
} = createGeocodingServices({
  getLanguage: async () =>
    (await settingsManager.get<string>('location', 'language')) || 'en',
  request: (input, init) => fetch(input, init),
  waitForGeocodingSlot,
  withRetry,
  retryOptions: RetryPresets.network,
  logger: logger.location,
})
async function createGeocodingProvider(): Promise<GeocodingProvider> {
  // const mapboxToken = useRuntimeConfig().mapbox?.accessToken
  const mapboxToken = await settingsManager.get<string>(
    'location',
    'mapbox.token',
  )

  if (mapboxToken) {
    return new MapboxGeocodingProvider(mapboxToken)
  }

  // 回退到 Nominatim 提供者
  return new NominatimGeocodingProvider(
    (await settingsManager.get<string>('location', 'nominatim.baseUrl')) ||
      undefined,
  )
}

export async function extractLocationFromGPS(
  gpsLatitude?: number,
  gpsLongitude?: number,
  provider?: GeocodingProvider,
): Promise<LocationInfo | null> {
  if (gpsLatitude == null || gpsLongitude == null) {
    return null
  }

  // 验证坐标范围
  if (!hasValidCoordinates(gpsLatitude, gpsLongitude)) {
    logger.location.warn(
      `Invalid GPS coordinates: ${gpsLatitude}, ${gpsLongitude}`,
    )
    return null
  }

  logger.location.info(
    `Reverse geocoding coordinates: ${gpsLatitude}, ${gpsLongitude}`,
  )

  // 如果没有指定提供者，使用默认提供者
  const geocodingProvider = provider || (await createGeocodingProvider())

  try {
    const locationInfo = await geocodingProvider.reverseGeocode(
      gpsLatitude,
      gpsLongitude,
    )

    if (locationInfo) {
      logger.location.success(
        `Location found: ${locationInfo.city}, ${locationInfo.country}`,
      )
    } else {
      logger.location.warn('No location found for coordinates')
    }

    return locationInfo
  } catch (error) {
    logger.location.error('Location extraction failed:', error)
    return null
  }
}

/**
 * 解析EXIF GPS数据为十进制度数
 */
