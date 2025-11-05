import type { SettingConfig } from '~~/shared/types/settings'

// 存储提供商的枚举值
export const STORAGE_PROVIDERS = ['local', 's3', 'openlist'] as const
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number]

export const DEFAULT_SETTINGS = [
  // NAMESPACE: system
  {
    namespace: 'system',
    key: 'firstLaunch',
    type: 'boolean',
    value: true,
    defaultValue: true,
    label: 'settings.system.firstLaunch.label',
    description: 'settings.system.firstLaunch.description',
    isReadonly: true,
  },
  // NAMESPACE: app
  {
    namespace: 'app',
    key: 'title',
    type: 'string',
    defaultValue: 'ChronoFrame',
    label: 'settings.app.title.label',
    description: 'settings.app.title.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'slogan',
    type: 'string',
    defaultValue: '',
    label: 'settings.app.slogan.label',
    description: 'settings.app.slogan.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'author',
    type: 'string',
    defaultValue: '',
    label: 'settings.app.author.label',
    description: 'settings.app.author.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'avatarUrl',
    type: 'string',
    defaultValue: '',
    label: 'settings.app.avatarUrl.label',
    description: 'settings.app.avatarUrl.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'appearance.theme',
    type: 'string',
    defaultValue: 'system',
    enum: ['light', 'dark', 'system'],
    label: 'settings.app.appearance.theme.label',
    description: 'settings.app.appearance.theme.description',
    isPublic: true,
  },
  // NAMESPACE: map
  {
    namespace: 'map',
    key: 'provider',
    type: 'string',
    defaultValue: 'maplibre',
    enum: ['mapbox', 'maplibre'],
    label: 'settings.map.provider.label',
    description: 'settings.map.provider.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'mapbox.token',
    type: 'string',
    defaultValue: '',
    label: 'settings.map.mapbox.token.label',
    description: 'settings.map.mapbox.token.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'mapbox.style',
    type: 'string',
    defaultValue: '',
    label: 'settings.map.mapbox.style.label',
    description: 'settings.map.mapbox.style.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'maplibre.token',
    type: 'string',
    defaultValue: '',
    label: 'settings.map.maplibre.token.label',
    description: 'settings.map.maplibre.token.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'maplibre.style',
    type: 'string',
    defaultValue: '',
    label: 'settings.map.maplibre.style.label',
    description: 'settings.map.maplibre.style.description',
    isPublic: true,
  },
  // NAMESPACE: location
  {
    namespace: 'location',
    key: 'mapbox.token',
    type: 'string',
    defaultValue: '',
    label: 'settings.location.mapbox.token.label',
    description: 'settings.location.mapbox.token.description',
    isPublic: true,
  },
  {
    namespace: 'location',
    key: 'nominatim.baseUrl',
    type: 'string',
    defaultValue: '',
    label: 'settings.location.nominatim.baseUrl.label',
    description: 'settings.location.nominatim.baseUrl.description',
    isPublic: true,
  },
  // NAMESPACE: storage
  {
    namespace: 'storage',
    key: 'provider',
    type: 'number',
    defaultValue: null,
    label: 'settings.storage_provider.provider.label',
    description: 'settings.storage_provider.provider.description',
  },
] as const satisfies SettingConfig[]

export const settingNamespaces = [
  ...new Set(DEFAULT_SETTINGS.map((s) => s.namespace)),
] as const
export const settingKeys = [
  ...new Set(DEFAULT_SETTINGS.map((s) => s.key)),
] as const

export type SettingNamespace = (typeof settingNamespaces)[number]
export type SettingKey<N extends SettingNamespace> = Extract<
  (typeof DEFAULT_SETTINGS)[number],
  { namespace: N }
>['key']
