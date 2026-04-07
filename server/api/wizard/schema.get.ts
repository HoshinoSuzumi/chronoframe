import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { getSettingUIConfig } from '~~/server/services/settings/ui-config'
import type { FieldDescriptor } from '~~/shared/types/settings'

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(
    event,
    z.object({
      namespace: z.string().min(1),
    }).parse,
  )

  // 1. Admin Account Schema
  if (query.namespace === 'admin') {
    // Use env variables for default values if configured
    const defaultUsername = process.env.CFRAME_ADMIN_NAME || 'admin'
    const defaultEmail = process.env.CFRAME_ADMIN_EMAIL || ''
    const defaultPassword = process.env.CFRAME_ADMIN_PASSWORD || ''

    const fields: FieldDescriptor[] = [
      {
        namespace: 'admin',
        key: 'username',
        type: 'string',
        defaultValue: defaultUsername,
        value: defaultUsername,
        label: 'wizard.admin.username.label',
        ui: { type: 'input', required: true, placeholder: 'admin' },
      },
      {
        namespace: 'admin',
        key: 'email',
        type: 'string',
        defaultValue: defaultEmail,
        value: defaultEmail,
        label: 'wizard.admin.email.label',
        ui: { type: 'input', required: true, placeholder: 'admin@example.com' },
      },
      {
        namespace: 'admin',
        key: 'password',
        type: 'string',
        defaultValue: defaultPassword,
        value: defaultPassword,
        label: 'wizard.admin.password.label',
        ui: { type: 'password', required: true },
      },
      {
        namespace: 'admin',
        key: 'confirmPassword',
        type: 'string',
        defaultValue: defaultPassword,
        value: defaultPassword,
        label: 'wizard.admin.confirmPassword.label',
        ui: { type: 'password', required: true },
      },
    ] as any[]

    return { namespace: 'admin', fields }
  }

  // 2. Storage Schema (Custom for Wizard)
  if (query.namespace === 'storage') {
    const storageFields = [
      {
        key: 'provider',
        type: 'string',
        defaultValue: 'local',
        label: 'settings.storage.provider.label',
      },
      {
        key: 'name',
        type: 'string',
        defaultValue: 'Default Storage',
        label: 'settings.storage.name.label',
      },
      // Local
      {
        key: 'local.basePath',
        type: 'string',
        defaultValue: './data/storage',
        label: 'settings.storage.local.basePath.label',
      },
      {
        key: 'local.baseUrl',
        type: 'string',
        defaultValue: '/storage',
        label: 'settings.storage.local.baseUrl.label',
      },
      {
        key: 'local.prefix',
        type: 'string',
        defaultValue: 'photos/',
        label: 'settings.storage.local.prefix.label',
      },
      // S3
      {
        key: 's3.endpoint',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.s3.endpoint.label',
      },
      {
        key: 's3.bucket',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.s3.bucket.label',
      },
      {
        key: 's3.region',
        type: 'string',
        defaultValue: 'auto',
        label: 'settings.storage.s3.region.label',
      },
      {
        key: 's3.accessKeyId',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.s3.accessKeyId.label',
      },
      {
        key: 's3.secretAccessKey',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.s3.secretAccessKey.label',
      },
      {
        key: 's3.prefix',
        type: 'string',
        defaultValue: '/photos',
        label: 'settings.storage.s3.prefix.label',
      },
      {
        key: 's3.cdnUrl',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.s3.cdnUrl.label',
      },
      {
        key: 's3.forcePathStyle',
        type: 'boolean',
        defaultValue: false,
        label: 'settings.storage.s3.forcePathStyle.label',
      },
      {
        key: 's3.maxKeys',
        type: 'number',
        defaultValue: 1000,
        label: 'settings.storage.s3.maxKeys.label',
      },
      // OpenList
      {
        key: 'openlist.baseUrl',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.openlist.baseUrl.label',
      },
      {
        key: 'openlist.rootPath',
        type: 'string',
        defaultValue: '/photos',
        label: 'settings.storage.openlist.rootPath.label',
      },
      {
        key: 'openlist.token',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.openlist.token.label',
      },
      {
        key: 'openlist.cdnUrl',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.openlist.cdnUrl.label',
      },
      {
        key: 'openlist.uploadEndpoint',
        type: 'string',
        defaultValue: '/api/fs/put',
        label: 'settings.storage.openlist.uploadEndpoint.label',
      },
      {
        key: 'openlist.downloadEndpoint',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.openlist.downloadEndpoint.label',
      },
      {
        key: 'openlist.listEndpoint',
        type: 'string',
        defaultValue: '',
        label: 'settings.storage.openlist.listEndpoint.label',
      },
      {
        key: 'openlist.deleteEndpoint',
        type: 'string',
        defaultValue: '/api/fs/remove',
        label: 'settings.storage.openlist.deleteEndpoint.label',
      },
      {
        key: 'openlist.metaEndpoint',
        type: 'string',
        defaultValue: '/api/fs/get',
        label: 'settings.storage.openlist.metaEndpoint.label',
      },
      {
        key: 'openlist.pathField',
        type: 'string',
        defaultValue: 'path',
        label: 'settings.storage.openlist.pathField.label',
      },
    ]

    const fields = storageFields.map((field) => {
      const ui = getSettingUIConfig('storage', field.key)
      return {
        namespace: 'storage',
        key: field.key,
        type: field.type,
        defaultValue: field.defaultValue,
        value: field.defaultValue,
        label: field.label,
        ui: ui || { type: 'input' },
      }
    }) as FieldDescriptor[]

    return { namespace: 'storage', fields }
  }

  // 3. App & Map Schemas (From Settings Manager)
  try {
    const schema = await settingsManager.getSchema()
    const namespaceSettings = schema.filter(
      (s) => s.namespace === query.namespace,
    )

    const fields = namespaceSettings.map((setting) => {
      const uiConfig = getSettingUIConfig(query.namespace, setting.key)

      // Patch for Wizard Map Provider to use rich selector
      if (query.namespace === 'map' && setting.key === 'provider') {
        return {
          ...setting,
          ui: {
            type: 'custom',
            options: [
              {
                label: 'wizard.map.provider.mapbox.label',
                value: 'mapbox',
                icon: 'simple-icons:mapbox',
                description: 'wizard.map.provider.mapbox.description',
              },
              {
                label: 'wizard.map.provider.maplibre.label',
                value: 'maplibre',
                icon: 'simple-icons:maplibre',
                description: 'wizard.map.provider.maplibre.description',
              },
            ],
          },
        }
      }

      return {
        ...setting,
        ui: uiConfig || {
          type: 'input' as const,
          required: false,
        },
      }
    })

    return {
      namespace: query.namespace,
      fields,
    }
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch wizard schema',
    })
  }
})
