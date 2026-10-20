import type { NormalizedLocation } from '@chronoframe/contracts/location'
import { hasValidCoordinates } from './coordinates.ts'
import { normalizeMapbox, normalizeNominatim } from './normalize.ts'
export interface LocationInfo {
  latitude: number
  longitude: number
  country?: string
  city?: string
  geocoding: NormalizedLocation
  locationName?: string
}

export interface GeocodingProvider {
  reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null>
}

export interface GeocodingLogger {
  success(...args: any[]): void
  info(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
}
export interface RetryOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
  timeout?: number
  retryCondition?: (error: Error) => boolean
  delayStrategy?: 'exponential' | 'linear' | 'fixed'
}
export interface GeocodingDependencies {
  getLanguage(): Promise<string>
  request: typeof fetch
  waitForGeocodingSlot(
    key: string,
    intervalMs: number,
    signal?: AbortSignal,
  ): Promise<void>
  withRetry<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options?: RetryOptions,
    logger?: GeocodingLogger,
  ): Promise<T>
  retryOptions: RetryOptions
  logger: GeocodingLogger
}

/** Create reverse-geocoding providers using caller-owned transport, retry, language and rate limits. */
export function createGeocodingServices({
  getLanguage,
  request,
  waitForGeocodingSlot,
  withRetry,
  retryOptions,
  logger,
}: GeocodingDependencies) {
  /**
   * Mapbox 地理编码提供者
   * 高精度商业地理编码服务，支持全球范围和多语言
   */
  class MapboxGeocodingProvider implements GeocodingProvider {
    private accessToken: string
    private readonly baseUrl = 'https://api.mapbox.com'
    private readonly rateLimitMs = 100 // Mapbox 默认速率限制为 1000/分钟，约60ms间隔

    constructor(accessToken: string) {
      this.accessToken = accessToken
    }

    async reverseGeocode(
      lat: number,
      lon: number,
    ): Promise<LocationInfo | null> {
      try {
        return await withRetry(
          async (signal) => {
            // 应用速率限制
            await waitForGeocodingSlot(this.baseUrl, this.rateLimitMs, signal)

            // 获取设置的地理编码语言，默认 'en'
            const language = (await getLanguage()) || 'en'

            const url = new URL('/search/geocode/v6/reverse', this.baseUrl)
            url.searchParams.set('access_token', this.accessToken)
            url.searchParams.set('longitude', lon.toString())
            url.searchParams.set('latitude', lat.toString())
            url.searchParams.set(
              'types',
              'address,place,locality,neighborhood,district,region,country',
            )

            // 映射 Mapbox 首选语言格式
            let mapboxLang = language
            if (language === 'zh-CN') {
              mapboxLang = 'zh-Hans'
            } else if (language === 'zh-TW') {
              mapboxLang = 'zh-Hant'
            }
            url.searchParams.set('language', mapboxLang)

            logger.info('Requesting Mapbox reverse geocoding')

            const response = await request(url.toString(), { signal })

            if (!response.ok) {
              throw new Error(
                `Mapbox API error: ${response.status} ${response.statusText}`,
              )
            }

            const data = await response.json()

            if (!data || !data.features || data.features.length === 0) {
              logger.warn('Mapbox API returned no features')
              return null
            }

            const geocoding = normalizeMapbox(data, language)
            if (!geocoding) return null
            return {
              latitude: lat,
              longitude: lon,
              geocoding,
              country: geocoding.components.country?.name,
              city: geocoding.components.city?.name,
              locationName: geocoding.formattedAddress,
            }
          },
          {
            ...retryOptions,
            timeout: 10000,
            delayStrategy: 'exponential',
          },
          logger,
        )
      } catch (error) {
        logger.error(
          'Mapbox reverse geocoding failed after all retries:',
          error,
        )
        return null
      }
    }
  }

  /**
   * OpenStreetMap Nominatim API 地理编码提供者
   * 免费的地理编码服务，适合开发和小规模使用
   */
  class NominatimGeocodingProvider implements GeocodingProvider {
    private readonly baseUrl: string
    private readonly userAgent = 'chronoframe/1.0'
    private readonly rateLimitMs = 1000 // Nominatim 要求至少1秒间隔

    constructor(baseUrl?: string) {
      this.baseUrl = baseUrl || 'https://nominatim.openstreetmap.org'
    }

    async reverseGeocode(
      lat: number,
      lon: number,
    ): Promise<LocationInfo | null> {
      try {
        return await withRetry(
          async (signal) => {
            // 应用速率限制
            await waitForGeocodingSlot(this.baseUrl, this.rateLimitMs, signal)

            // 获取设置的地理编码语言，默认 'en'
            const language = (await getLanguage()) || 'en'

            const url = new URL('/reverse', this.baseUrl)
            url.searchParams.set('lat', lat.toString())
            url.searchParams.set('lon', lon.toString())
            url.searchParams.set('format', 'json')
            url.searchParams.set('addressdetails', '1')
            url.searchParams.set('accept-language', `${language},en`)

            const response = await request(url.toString(), {
              signal,
              headers: {
                'User-Agent': this.userAgent,
              },
            })

            if (!response.ok) {
              throw new Error(
                `Nominatim API error: ${response.status} ${response.statusText}`,
              )
            }

            const data = await response.json()

            if (!data || data.error) {
              throw new Error(`Nominatim API returned error: ${data?.error}`)
            }

            const geocoding = normalizeNominatim(data, language)
            if (!geocoding) return null
            return {
              latitude: lat,
              longitude: lon,
              geocoding,
              country: geocoding.components.country?.name,
              city: geocoding.components.city?.name,
              locationName: geocoding.formattedAddress,
            }
          },
          {
            ...retryOptions,
            timeout: 15000, // Nominatim 可能比较慢
            delayStrategy: 'linear', // 线性退避，避免过快重试
          },
          logger,
        )
      } catch (error) {
        logger.error(
          'Nominatim reverse geocoding failed after all retries:',
          error,
        )
        return null
      }
    }
  }

  /** Parse bounded decimal GPS text or explicit EXIF coordinates, applying hemisphere references. */
  function parseGPSCoordinates(exifData: any): {
    latitude?: number
    longitude?: number
  } {
    try {
      let latitude: number | undefined
      let longitude: number | undefined

      // 尝试从GPSLatitude和GPSLongitude获取
      if (exifData.GPSLatitude != null && exifData.GPSLongitude != null) {
        latitude = parseFloat(exifData.GPSLatitude.toString())
        longitude = parseFloat(exifData.GPSLongitude.toString())
      }

      // 如果上面的方法失败，尝试从GPSCoordinates获取
      if (
        !hasValidCoordinates(latitude, longitude) &&
        exifData.GPSCoordinates
      ) {
        const coords = exifData.GPSCoordinates.toString()
        // Bound metadata input and validate whole tokens without overlapping
        // numeric quantifiers that can cause polynomial regex backtracking.
        if (coords.length <= 256) {
          const tokens = coords
            .trim()
            .split(/[°,\s]+/)
            .filter(Boolean)
          const [lat, lon] = tokens
          const decimal = /^[-+]?\d+(?:\.\d*)?$/
          if (
            tokens.length === 2 &&
            lat &&
            lon &&
            decimal.test(lat) &&
            decimal.test(lon)
          ) {
            latitude = Number(lat)
            longitude = Number(lon)
          }
        }
      }

      // 应用GPS参考（南纬为负，西经为负）
      if (latitude && exifData.GPSLatitudeRef === 'S') {
        latitude = -Math.abs(latitude)
      }
      if (longitude && exifData.GPSLongitudeRef === 'W') {
        longitude = -Math.abs(longitude)
      }

      if (!hasValidCoordinates(latitude, longitude)) return {}
      return { latitude, longitude }
    } catch (error) {
      logger.error('Failed to parse GPS coordinates:', error)
      return {}
    }
  }

  return {
    MapboxGeocodingProvider,
    NominatimGeocodingProvider,
    parseGPSCoordinates,
  }
}
export * from './normalize.ts'
export * from './coordinates.ts'
export * from './rate-limit.ts'
