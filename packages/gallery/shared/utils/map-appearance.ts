export const DEFAULT_MAPBOX_STYLE = 'mapbox://styles/mapbox/standard'
export type MapLightPreset = 'dawn' | 'day' | 'dusk' | 'night'

/** Match the self-hosted photo map's capture-time bands in the viewer's local time. */
export function mapLightPreset(
  dateTaken: string | null | undefined,
  theme: string,
): MapLightPreset {
  if (!dateTaken) return theme === 'dark' ? 'night' : 'day'
  const hour = new Date(dateTaken).getHours()
  if (!Number.isFinite(hour)) return theme === 'dark' ? 'night' : 'day'
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'night'
}
