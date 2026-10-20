import { setTimeout } from 'node:timers/promises'

export function createGeocodingRateLimiter() {
  const nextRequestAt = new Map<string, number>()

  // Reserve synchronously before waiting so separate providers/workers cannot
  // start together after the same delay. Providers are recreated for each photo.
  async function waitForGeocodingSlot(
    key: string,
    intervalMs: number,
    signal?: AbortSignal,
  ) {
    const now = Date.now()
    const start = Math.max(now, nextRequestAt.get(key) || 0)
    nextRequestAt.set(key, start + intervalMs)
    if (start > now) await setTimeout(start - now, undefined, { signal })
  }

  return waitForGeocodingSlot
}
