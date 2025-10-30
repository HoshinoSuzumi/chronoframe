import type { SettingConfig } from '~~/shared/types/settings'

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
    isInternal: 1,
    isReadonly: 1,
  },
  // NAMESPACE: storage
  {
    namespace: 'storage',
    key: 'provider',
    type: 'string',
    defaultValue: 'local',
    label: 'settings.storage_provider.firstLaunch.label',
    description: 'settings.storage_provider.firstLaunch.description',
  },
  {
    namespace: 'storage',
    key: 'provider.local.path',
    type: 'string',
    defaultValue: './data/storage',
    label: 'settings.storage.provider.local.path.label',
    description: 'settings.storage.provider.local.path.description',
  },
  {
    namespace: 'storage',
    key: 'provider.local.baseUrl',
    type: 'string',
    defaultValue: '/storage',
    label: 'settings.storage.provider.local.baseUrl.label',
    description: 'settings.storage.provider.local.baseUrl.description',
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
