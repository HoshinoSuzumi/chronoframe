export type AnalyticsDateRange = {
  from: string
  to: string
  preset?: number
  allTime?: boolean
}
export const ANALYTICS_PRESETS = [
  1800, 3600, 21600, 43200, 86400, 604800, 2592000,
] as const
export function analyticsYearBoundary(now = Date.now()) {
  const date = new Date(now)
  return Date.UTC(
    date.getUTCFullYear() - 1,
    date.getUTCMonth(),
    date.getUTCDate(),
  )
}
export function relativeRange(
  seconds: number,
  now = Date.now(),
): AnalyticsDateRange {
  now = Math.floor(now / 60000) * 60000
  return {
    from: new Date(now - seconds * 1000).toISOString(),
    to: new Date(now).toISOString(),
    preset: seconds,
  }
}
export function rangeInput(value: string, utc: boolean) {
  const date = new Date(value)
  return new Date(date.getTime() - (utc ? 0 : date.getTimezoneOffset() * 60000))
    .toISOString()
    .slice(0, 16)
}
export function inputInstant(value: string, utc: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN
  return Date.parse(value + (utc ? ':00Z' : ':00'))
}
