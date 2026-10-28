import { PUBLIC_GALLERY_DEFAULTS } from '@chronoframe/contracts/gallery-settings'
import { tourIds } from '#shared/types/tours'
import type { SettingConfig } from '#shared/types/settings'
import i18nOptions from '@chronoframe/gallery/i18n/i18n.options'

// 存储提供商的枚举值
export const STORAGE_PROVIDERS = ['local', 's3', 'openlist'] as const
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number]

export const DEFAULT_SETTINGS = [
  ...tourIds.map((id) => ({
    namespace: 'system' as const,
    key: `tour.${id}` as const,
    type: 'string' as const,
    defaultValue: 'pending',
    enum: ['pending', 'completed', 'skipped'],
    hidden: true,
    isReadonly: true,
  })),
  // NAMESPACE: system
  {
    namespace: 'system',
    key: 'queue.workerCount',
    type: 'number',
    defaultValue: 5,
    label: 'settings.system.queue.workerCount.label',
    description: 'settings.system.queue.workerCount.description',
  },
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
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['title'],
    label: 'settings.app.title.label',
    description: 'settings.app.title.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'slogan',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['slogan'],
    label: 'settings.app.slogan.label',
    description: 'settings.app.slogan.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'author',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['author'],
    label: 'settings.app.author.label',
    description: 'settings.app.author.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'avatarUrl',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['avatarUrl'],
    label: 'settings.app.avatarUrl.label',
    description: 'settings.app.avatarUrl.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'avatarStorageKey',
    type: 'string',
    defaultValue: '',
    hidden: true,
  },
  {
    namespace: 'app',
    key: 'homeView',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['homeView'],
    enum: ['photos', 'albums'],
    label: 'settings.app.homeView.label',
    description: 'settings.app.homeView.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'socialLinks',
    type: 'json',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['socialLinks'],
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'appearance.theme',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['appearance.theme'],
    enum: ['light', 'dark', 'system'],
    label: 'settings.app.appearance.theme.label',
    description: 'settings.app.appearance.theme.description',
    isPublic: true,
  },
  {
    namespace: 'app',
    key: 'appearance.homeHeaderLayout',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['app']['appearance.homeHeaderLayout'],
    enum: ['embedded', 'fixed'],
    label: 'settings.app.appearance.homeHeaderLayout.label',
    description: 'settings.app.appearance.homeHeaderLayout.description',
    isPublic: true,
  },
  {
    namespace: 'system',
    key: 'upload.maxFileSize',
    type: 'number',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['system']['upload.maxFileSize'],
    label: 'settings.app.upload.maxFileSize.label',
    description: 'settings.app.upload.maxFileSize.description',
    isPublic: true,
  },
  {
    namespace: 'system',
    key: 'upload.duplicateCheck.enabled',
    type: 'boolean',
    defaultValue:
      PUBLIC_GALLERY_DEFAULTS['system']['upload.duplicateCheck.enabled'],
    label: 'settings.system.upload.duplicateCheck.enabled.label',
    description: 'settings.system.upload.duplicateCheck.enabled.description',
    isPublic: true,
  },
  {
    namespace: 'system',
    key: 'upload.duplicateCheck.mode',
    type: 'string',
    defaultValue:
      PUBLIC_GALLERY_DEFAULTS['system']['upload.duplicateCheck.mode'],
    enum: ['warn', 'block', 'skip'],
    label: 'settings.system.upload.duplicateCheck.mode.label',
    description: 'settings.system.upload.duplicateCheck.mode.description',
    isPublic: true,
  },
  {
    namespace: 'system',
    key: 'webglImageViewerDebug',
    type: 'boolean',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['system']['webglImageViewerDebug'],
    label: 'settings.system.webglImageViewerDebug.label',
    description: 'settings.system.webglImageViewerDebug.description',
    isPublic: true,
  },
  {
    namespace: 'system',
    key: 'auth.github.enabled',
    type: 'boolean',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['system']['auth.github.enabled'],
    label: 'settings.system.auth.github.enabled.label',
    description: 'settings.system.auth.github.enabled.description',
    isPublic: true,
  },
  {
    namespace: 'system',
    key: 'auth.github.clientId',
    type: 'string',
    defaultValue: '',
    label: 'settings.system.auth.github.clientId.label',
    description: 'settings.system.auth.github.clientId.description',
  },
  {
    namespace: 'system',
    key: 'auth.github.clientSecret',
    type: 'string',
    defaultValue: '',
    label: 'settings.system.auth.github.clientSecret.label',
    description: 'settings.system.auth.github.clientSecret.description',
    isSecret: true,
  },
  // NAMESPACE: privacy
  {
    namespace: 'privacy',
    key: 'upload.autoEraseLocation',
    type: 'boolean',
    defaultValue:
      PUBLIC_GALLERY_DEFAULTS['privacy']['upload.autoEraseLocation'],
    label: 'settings.privacy.upload.autoEraseLocation.label',
    description: 'settings.privacy.upload.autoEraseLocation.description',
    isPublic: true,
  },
  // NAMESPACE: map
  {
    namespace: 'map',
    key: 'provider',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['map']['provider'],
    enum: ['mapbox', 'maplibre'],
    label: 'settings.map.provider.label',
    description: 'settings.map.provider.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'mapbox.token',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['map']['mapbox.token'],
    label: 'settings.map.mapbox.token.label',
    description: 'settings.map.mapbox.token.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'mapbox.style',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['map']['mapbox.style'],
    label: 'settings.map.mapbox.style.label',
    description: 'settings.map.mapbox.style.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'maplibre.token',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['map']['maplibre.token'],
    label: 'settings.map.maplibre.token.label',
    description: 'settings.map.maplibre.token.description',
    isPublic: true,
  },
  {
    namespace: 'map',
    key: 'maplibre.style',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['map']['maplibre.style'],
    label: 'settings.map.maplibre.style.label',
    description: 'settings.map.maplibre.style.description',
    isPublic: true,
  },
  // NAMESPACE: location
  {
    namespace: 'location',
    key: 'preferredLevel',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['location']['preferredLevel'],
    enum: [
      'country',
      'region',
      'subregion',
      'city',
      'district',
      'locality',
      'neighborhood',
    ],
    label: 'settings.location.preferredLevel.label',
    description: 'settings.location.preferredLevel.description',
    isPublic: true,
  },
  {
    namespace: 'location',
    key: 'fallbackOrder',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['location']['fallbackOrder'],
    label: 'settings.location.fallbackOrder.label',
    description: 'settings.location.fallbackOrder.description',
    isPublic: true,
  },
  {
    namespace: 'location',
    key: 'language',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['location']['language'],
    enum: i18nOptions.locales.map(({ language }) => language),
    label: 'settings.location.language.label',
    description: 'settings.location.language.description',
    isPublic: true,
  },
  {
    namespace: 'location',
    key: 'mapbox.token',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['location']['mapbox.token'],
    label: 'settings.location.mapbox.token.label',
    description: 'settings.location.mapbox.token.description',
    isPublic: true,
  },
  {
    namespace: 'location',
    key: 'nominatim.baseUrl',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['location']['nominatim.baseUrl'],
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
  // NAMESPACE: analytics
  {
    namespace: 'analytics',
    key: 'headScripts',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['analytics']['headScripts'],
    label: 'settings.analytics.headScripts.label',
    description: 'settings.analytics.headScripts.description',
    isPublic: true,
  },
  {
    namespace: 'analytics',
    key: 'bodyScripts',
    type: 'string',
    defaultValue: PUBLIC_GALLERY_DEFAULTS['analytics']['bodyScripts'],
    label: 'settings.analytics.bodyScripts.label',
    description: 'settings.analytics.bodyScripts.description',
    isPublic: true,
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

export function getHiddenSettingKeys(namespace: string): Set<string> {
  const settings = DEFAULT_SETTINGS as readonly SettingConfig[]
  return new Set(
    settings
      .filter((setting) => setting.namespace === namespace && setting.hidden)
      .map((setting) => setting.key),
  )
}
