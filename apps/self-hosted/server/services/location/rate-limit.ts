import { createGeocodingRateLimiter } from '@chronoframe/geocoding/rate-limit'
export const waitForGeocodingSlot = createGeocodingRateLimiter()
