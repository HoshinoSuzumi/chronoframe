import type { FieldUIConfig } from '~~/shared/types/settings'

/**
 * Extended settings configuration with UI descriptions
 * This defines how the frontend displays and interacts with each settings field
 *
 * Note:
 * - This is only used on the Server side
 * - UI configuration information is returned to the frontend via API
 * - Avoid duplicating these configurations on the frontend
 */
export const APP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  title: {
    type: 'input',
    placeholder: 'ChronoFrame',
    required: true,
  },
  slogan: {
    type: 'input',
    placeholder: 'Your gallery slogan',
    help: 'settings.app.slogan.help',
  },
  author: {
    type: 'input',
    placeholder: 'Your name',
  },
  avatarUrl: {
    type: 'url',
    placeholder: 'https://example.com/avatar.jpg',
    help: 'settings.app.avatarUrl.help',
  },
  'appearance.theme': {
    type: 'tabs',
    options: [
      {
        label: 'settings.app.appearance.theme.light',
        value: 'light',
        icon: 'tabler:sun',
      },
      {
        label: 'settings.app.appearance.theme.dark',
        value: 'dark',
        icon: 'tabler:moon',
      },
      {
        label: 'settings.app.appearance.theme.system',
        value: 'system',
        icon: 'tabler:device-desktop',
      },
    ],
    help: 'settings.app.appearance.theme.help',
  },
}

export const MAP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  provider: {
    type: 'tabs',
    options: [
      { label: 'MapBox', value: 'mapbox' },
      { label: 'MapLibre', value: 'maplibre' },
    ],
  },
  'mapbox.token': {
    type: 'password',
    placeholder: 'pk.xxxxxx',
    required: true,
    visibleIf: { fieldKey: 'provider', value: 'mapbox' },
    help: 'settings.map.mapbox.token.help',
  },
  'mapbox.style': {
    type: 'input',
    placeholder: 'mapbox://styles/mapbox/light-v11',
    visibleIf: { fieldKey: 'provider', value: 'mapbox' },
  },
  'maplibre.token': {
    type: 'password',
    placeholder: 'pk.xxxxxx',
    required: true,
    visibleIf: { fieldKey: 'provider', value: 'maplibre' },
    help: 'settings.map.maplibre.token.help',
  },
  'maplibre.style': {
    type: 'input',
    placeholder: 'https://example.com/style.json',
    visibleIf: { fieldKey: 'provider', value: 'maplibre' },
  },
}

export const LOCATION_SETTINGS_UI: Record<string, FieldUIConfig> = {
  'mapbox.token': {
    type: 'password',
    placeholder: 'pk.xxxxxx',
    help: 'settings.location.mapbox.token.help',
  },
  'nominatim.baseUrl': {
    type: 'url',
    placeholder: 'https://nominatim.openstreetmap.org',
    help: 'settings.location.nominatim.baseUrl.help',
  },
}

export const STORAGE_SETTINGS_UI: Record<string, FieldUIConfig> = {
  provider: {
    type: 'select',
    help: 'settings.storage.provider.help',
  },
}

/**
 * Get UI configuration for a specific setting
 * Used to return complete field descriptions in the fields.get.ts API
 */
export function getSettingUIConfig(
  namespace: string,
  key: string,
): FieldUIConfig | undefined {
  const uiConfigMap: Record<string, Record<string, FieldUIConfig>> = {
    app: APP_SETTINGS_UI,
    map: MAP_SETTINGS_UI,
    location: LOCATION_SETTINGS_UI,
    storage: STORAGE_SETTINGS_UI,
  }

  return uiConfigMap[namespace]?.[key]
}
