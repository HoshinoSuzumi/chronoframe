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

export const PRIVACY_SETTINGS_UI: Record<string, FieldUIConfig> = {
  'upload.autoEraseLocation': {
    type: 'toggle',
    help: 'settings.privacy.upload.autoEraseLocation.help',
  },
}

export const SYSTEM_SETTINGS_UI: Record<string, FieldUIConfig> = {
  'upload.maxFileSize': {
    type: 'number',
    help: 'settings.app.upload.maxFileSize.help',
    min: 1,
    max: 10240,
  },
  'upload.duplicateCheck.enabled': {
    type: 'toggle',
    help: 'settings.system.upload.duplicateCheck.enabled.help',
  },
  'upload.duplicateCheck.mode': {
    type: 'tabs',
    options: [
      {
        label: 'settings.system.upload.duplicateCheck.mode.options.skip',
        value: 'skip',
        icon: 'tabler:player-track-next',
      },
      {
        label: 'settings.system.upload.duplicateCheck.mode.options.warn',
        value: 'warn',
        icon: 'tabler:alert-triangle',
      },
      {
        label: 'settings.system.upload.duplicateCheck.mode.options.block',
        value: 'block',
        icon: 'tabler:ban',
      },
    ],
    help: 'settings.system.upload.duplicateCheck.mode.help',
  },
  webglImageViewerDebug: {
    type: 'toggle',
    help: 'settings.system.webglImageViewerDebug.help',
  },
}

export const STORAGE_SETTINGS_UI: Record<string, FieldUIConfig> = {
  provider: {
    type: 'custom',
    options: [
      {
        label: 'settings.storage.provider.options.local.label',
        value: 'local',
        icon: 'tabler:server',
        description: 'settings.storage.provider.options.local.description',
      },
      {
        label: 'settings.storage.provider.options.s3.label',
        value: 's3',
        icon: 'tabler:brand-aws',
        description: 'settings.storage.provider.options.s3.description',
      },
      {
        label: 'settings.storage.provider.options.openlist.label',
        value: 'openlist',
        icon: 'tabler:stack',
        description: 'settings.storage.provider.options.openlist.description',
      },
    ],
  },
  name: {
    type: 'input',
    required: true,
  },
  // Local
  'local.basePath': {
    type: 'input',
    required: true,
    help: 'settings.storage.local.basePath.description',
    visibleIf: { fieldKey: 'provider', value: 'local' },
  },
  'local.baseUrl': {
    type: 'input',
    help: 'settings.storage.local.baseUrl.description',
    visibleIf: { fieldKey: 'provider', value: 'local' },
  },
  'local.prefix': {
    type: 'input',
    placeholder: 'photos/',
    help: 'settings.storage.local.prefix.description',
    visibleIf: { fieldKey: 'provider', value: 'local' },
  },
  // S3
  's3.endpoint': {
    type: 'input',
    required: true,
    placeholder: 'https://s3.amazonaws.com',
    help: 'settings.storage.s3.endpoint.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.bucket': {
    type: 'input',
    required: true,
    help: 'settings.storage.s3.bucket.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.region': {
    type: 'input',
    required: true,
    help: 'settings.storage.s3.region.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.accessKeyId': {
    type: 'input',
    required: true,
    help: 'settings.storage.s3.accessKeyId.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.secretAccessKey': {
    type: 'password',
    required: true,
    help: 'settings.storage.s3.secretAccessKey.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.prefix': {
    type: 'input',
    placeholder: '/photos',
    help: 'settings.storage.s3.prefix.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.cdnUrl': {
    type: 'input',
    help: 'settings.storage.s3.cdnUrl.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.forcePathStyle': {
    type: 'toggle',
    help: 'settings.storage.s3.forcePathStyle.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  's3.maxKeys': {
    type: 'number',
    help: 'settings.storage.s3.maxKeys.description',
    visibleIf: { fieldKey: 'provider', value: 's3' },
  },
  // OpenList
  'openlist.baseUrl': {
    type: 'input',
    required: true,
    placeholder: 'https://alist.example.com',
    help: 'settings.storage.openlist.baseUrl.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.rootPath': {
    type: 'input',
    required: true,
    placeholder: '/photos',
    help: 'settings.storage.openlist.rootPath.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.token': {
    type: 'password',
    required: true,
    help: 'settings.storage.openlist.token.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.cdnUrl': {
    type: 'input',
    help: 'settings.storage.openlist.cdnUrl.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.uploadEndpoint': {
    type: 'input',
    placeholder: '/api/fs/put',
    help: 'settings.storage.openlist.uploadEndpoint.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.downloadEndpoint': {
    type: 'input',
    help: 'settings.storage.openlist.downloadEndpoint.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.listEndpoint': {
    type: 'input',
    help: 'settings.storage.openlist.listEndpoint.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.deleteEndpoint': {
    type: 'input',
    placeholder: '/api/fs/remove',
    help: 'settings.storage.openlist.deleteEndpoint.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.metaEndpoint': {
    type: 'input',
    placeholder: '/api/fs/get',
    help: 'settings.storage.openlist.metaEndpoint.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
  },
  'openlist.pathField': {
    type: 'input',
    placeholder: 'path',
    help: 'settings.storage.openlist.pathField.description',
    visibleIf: { fieldKey: 'provider', value: 'openlist' },
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
    system: SYSTEM_SETTINGS_UI,
    privacy: PRIVACY_SETTINGS_UI,
    map: MAP_SETTINGS_UI,
    location: LOCATION_SETTINGS_UI,
    storage: STORAGE_SETTINGS_UI,
  }

  return uiConfigMap[namespace]?.[key]
}
