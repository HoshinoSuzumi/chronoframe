import type { FieldUIConfig } from '~~/shared/types/settings'

/**
 * 扩展的设置配置，包含 UI 描述
 * 这定义了前端如何显示和交互每个设置字段
 *
 * 注意：
 * - 这只在 Server 端使用
 * - UI 配置信息通过 API 返回给前端
 * - 避免在前端重复定义这些配置
 */

// App 设置的 UI 配置
export const APP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  title: {
    type: 'input',
    placeholder: 'ChronoFrame',
    required: true,
    help: 'settings.app.title.help',
  },
  slogan: {
    type: 'input',
    placeholder: 'Your gallery slogan',
    help: 'settings.app.slogan.help',
  },
  author: {
    type: 'input',
    placeholder: 'Your name',
    help: 'settings.app.author.help',
  },
  avatarUrl: {
    type: 'url',
    placeholder: 'https://example.com/avatar.jpg',
    help: 'settings.app.avatarUrl.help',
  },
  'appearance.theme': {
    type: 'tabs',
    options: [
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
      { label: 'System', value: 'system' },
    ],
    help: 'settings.app.appearance.theme.help',
  },
}

// Map 设置的 UI 配置
export const MAP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  provider: {
    type: 'tabs',
    options: [
      { label: 'MapBox', value: 'mapbox' },
      { label: 'MapLibre', value: 'maplibre' },
    ],
    help: 'settings.map.provider.help',
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
    help: 'settings.map.mapbox.style.help',
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
    help: 'settings.map.maplibre.style.help',
  },
}

// Location 设置的 UI 配置
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

// Storage 设置的 UI 配置
export const STORAGE_SETTINGS_UI: Record<string, FieldUIConfig> = {
  provider: {
    type: 'select',
    help: 'settings.storage.provider.help',
  },
}

/**
 * 获取特定设置的 UI 配置
 * 用于在 fields.get.ts API 中返回完整的字段描述
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
