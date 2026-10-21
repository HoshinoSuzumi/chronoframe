type MapServiceConfig = Record<string, unknown> | null | undefined

const text = (config: MapServiceConfig, key: string) =>
  String(config?.[key] ?? '').trim()

/**
 * Default MapLibre styles call MapTiler, and Mapbox styles need an access token.
 * A custom MapLibre style URL can load without a MapTiler token.
 */
export function isMapServiceConfigured(config: MapServiceConfig): boolean {
  const provider = text(config, 'provider') || 'maplibre'

  if (provider === 'mapbox') {
    return text(config, 'mapbox.token').length > 0
  }

  return (
    text(config, 'maplibre.token').length > 0 ||
    text(config, 'maplibre.style').length > 0
  )
}
