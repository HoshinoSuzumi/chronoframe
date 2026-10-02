import type { SettingValue } from '~~/shared/types/settings'
import { DEFAULT_SETTINGS } from '../services/settings/contants'
import type { SettingNamespace } from '../services/settings/contants'
import { settingsManager } from '../services/settings/settingsManager'
import { and, eq, tables, useDB } from '../utils/db'

export default defineNitroPlugin(async (_nitroApp) => {
  const _settingsManager = settingsManager

  // Mark initialization phase to prevent storage provider switch triggers
  // until storage manager is properly initialized in plugin 2_storage.ts
  _settingsManager.setInitializingFlag(true)

  try {
    // Initialize default settings first
    await _settingsManager.init(DEFAULT_SETTINGS)

    // Clean up deprecated settings keys from pre-release iterations.
    await removeDeprecatedSettings()

    // Migrate existing configurations from runtimeConfig
    // Note: Storage manager will be initialized in the next plugin (2_storage.ts)
    await migrateRuntimeConfigToSettings()

    // Sync GitHub OAuth credentials from settings to process.env for auth-utils.
    await syncGithubOAuthEnvFromSettings()
  } finally {
    _settingsManager.setInitializingFlag(false)
  }
})

/**
 * Read an environment variable only when the operator explicitly set a
 * non-empty value. This ignores nuxt.config built-in defaults that always
 * appear in useRuntimeConfig() (e.g. public.app.title = "ChronoFrame").
 */
function getExplicitEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Seed settings from explicit environment variables.
 *
 * Env vars are a one-shot bootstrap for fresh installs. Values already
 * customized in the dashboard or setup wizard (value !== default_value) are
 * left untouched, so UI changes survive restarts even if env still has an
 * older title.
 */
async function migrateRuntimeConfigToSettings() {
  const config = useRuntimeConfig() as any
  const _logger = logger.dynamic('settings-migration')

  try {
    _logger.info('Migrating app settings from explicit env')
    const appEnvSeeds: Array<[string, string | undefined]> = [
      ['title', getExplicitEnv('NUXT_PUBLIC_APP_TITLE')],
      ['slogan', getExplicitEnv('NUXT_PUBLIC_APP_SLOGAN')],
      ['author', getExplicitEnv('NUXT_PUBLIC_APP_AUTHOR')],
      ['avatarUrl', getExplicitEnv('NUXT_PUBLIC_APP_AVATAR_URL')],
    ]

    for (const [key, value] of appEnvSeeds) {
      if (value !== undefined) {
        await migrateSetting('app', key, value, _logger)
      }
    }

    _logger.info('Migrating map settings from explicit env')
    const mapEnvSeeds: Array<[string, string | undefined]> = [
      ['provider', getExplicitEnv('NUXT_PUBLIC_MAP_PROVIDER')],
      ['mapbox.token', getExplicitEnv('NUXT_MAPBOX_ACCESS_TOKEN')],
      ['mapbox.style', getExplicitEnv('NUXT_PUBLIC_MAP_MAPBOX_STYLE')],
      ['maplibre.token', getExplicitEnv('NUXT_PUBLIC_MAP_MAPLIBRE_TOKEN')],
      ['maplibre.style', getExplicitEnv('NUXT_PUBLIC_MAP_MAPLIBRE_STYLE')],
    ]

    for (const [key, value] of mapEnvSeeds) {
      if (value !== undefined) {
        await migrateSetting('map', key, value, _logger)
      }
    }

    // Migrate auth settings (GitHub OAuth) from explicit env only
    const githubOauthEnabled = getExplicitEnv('NUXT_PUBLIC_OAUTH_GITHUB_ENABLED')
    if (githubOauthEnabled === 'true') {
      await migrateSetting('system', 'auth.github.enabled', true, _logger)
    }

    const githubOauthSettings: Array<[string, string | undefined]> = [
      ['auth.github.clientId', getExplicitEnv('NUXT_OAUTH_GITHUB_CLIENT_ID')],
      [
        'auth.github.clientSecret',
        getExplicitEnv('NUXT_OAUTH_GITHUB_CLIENT_SECRET'),
      ],
    ]

    for (const [key, value] of githubOauthSettings) {
      if (value !== undefined) {
        await migrateSetting('system', key, value, _logger)
      }
    }

    // Migrate storage configuration and set as active provider
    if (config.STORAGE_PROVIDER || config.provider) {
      _logger.info('Migrating storage configuration')

      const storageProvider = config.STORAGE_PROVIDER || 's3'
      const providerConfig =
        config.provider?.[storageProvider as keyof typeof config.provider]

      if (providerConfig) {
        const normalizedConfig = normalizeProviderConfig(
          storageProvider,
          providerConfig,
        )

        if (!isRuntimeProviderConfigUsable(normalizedConfig)) {
          _logger.info(
            `Skipping storage migration for ${storageProvider}: runtime config is incomplete`,
          )
        } else {
          try {
            // Check if a provider of the same type already exists
            const existingProviders = await settingsManager.storage.getProviders()
            const sameTypeProviderExists = existingProviders.some(
              (provider) => provider.provider === storageProvider,
            )

            if (sameTypeProviderExists) {
              _logger.info(
                `Storage provider of type ${storageProvider} already exists, skipping creation`,
              )
            } else {
              // Create a storage provider from the current configuration
              const providerName = `Migrated ${storageProvider} Provider`

              const providerId = await settingsManager.storage.addProvider({
                name: providerName,
                provider: storageProvider as 's3' | 'local' | 'openlist',
                config: normalizedConfig,
              })

              // Set this as the active provider
              await settingsManager.set(
                'storage',
                'provider',
                providerId,
                undefined,
                true,
              )
              _logger.info(
                `Storage provider migrated and set as active. Provider ID: ${providerId}`,
              )
            }
          } catch (error) {
            _logger.error('Failed to migrate storage provider:', error)
          }
        }
      }
    }

    _logger.info('Configuration migration completed')
  } catch (error) {
    _logger.error('Failed to migrate configurations:', error)
  }
}

/**
 * Write an explicit env value into a setting, but only if the setting still
 * holds its default value. This keeps seeding one-shot per setting and
 * prevents env / compose defaults from overwriting dashboard changes on
 * every server start.
 */
async function migrateSetting(
  namespace: SettingNamespace,
  key: string,
  value: SettingValue,
  _logger: ReturnType<typeof logger.dynamic>,
) {
  if (!settingsManager.isDefault(namespace, key as any)) {
    _logger.debug(
      `Skipping migration of ${namespace}.${key}: already customized by user`,
    )
    return
  }

  try {
    await settingsManager.set(namespace, key as any, value, undefined, true)
    _logger.debug(`Migrated ${namespace}.${key}`)
  } catch (error) {
    _logger.warn(`Failed to migrate ${namespace}.${key}:`, error)
  }
}

async function syncGithubOAuthEnvFromSettings() {
  const config = useRuntimeConfig() as any

  const enabled = await settingsManager.get<boolean>(
    'system',
    'auth.github.enabled' as any,
    Boolean(config.public?.oauth?.github?.enabled),
  )
  const clientId = await settingsManager.get<string>(
    'system',
    'auth.github.clientId' as any,
    config.oauth?.github?.clientId || '',
  )
  const clientSecret = await settingsManager.get<string>(
    'system',
    'auth.github.clientSecret' as any,
    config.oauth?.github?.clientSecret || '',
  )

  const canEnableGithubOauth = Boolean(enabled && clientId && clientSecret)

  if (canEnableGithubOauth) {
    process.env.NUXT_OAUTH_GITHUB_CLIENT_ID = clientId || ''
    process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET = clientSecret || ''
  } else {
    delete process.env.NUXT_OAUTH_GITHUB_CLIENT_ID
    delete process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET
  }
}

async function removeDeprecatedSettings() {
  const db = useDB()

  db.delete(tables.settings)
    .where(
      and(
        eq(tables.settings.namespace, 'app'),
        eq(tables.settings.key, 'upload.maxFileSize'),
      ),
    )
    .run()
}

/**
 * Normalize provider configuration based on provider type
 */
function normalizeProviderConfig(provider: string, config: any): any {
  switch (provider) {
    case 's3':
      return {
        provider: 's3',
        endpoint: config.endpoint || '',
        bucket: config.bucket || '',
        region: config.region || 'auto',
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || '',
        prefix: config.prefix || '/photos',
        cdnUrl: config.cdnUrl || '',
        forcePathStyle: config.forcePathStyle ?? false,
      }

    case 'local':
      return {
        provider: 'local',
        basePath: config.localPath || './data/storage',
        baseUrl: config.baseUrl || '/storage',
        prefix: config.prefix || 'photos/',
      }

    case 'openlist': {
      // Support both old nested and new flat endpoint formats
      const oldEndpoints = config.endpoints || {}
      return {
        provider: 'openlist',
        baseUrl: config.baseUrl || '',
        rootPath: config.rootPath || '',
        token: config.token || '',
        uploadEndpoint:
          config.uploadEndpoint ?? oldEndpoints.upload ?? '/api/fs/put',
        downloadEndpoint: config.downloadEndpoint ?? oldEndpoints.download,
        listEndpoint: config.listEndpoint ?? oldEndpoints.list,
        deleteEndpoint:
          config.deleteEndpoint ?? oldEndpoints.delete ?? '/api/fs/remove',
        metaEndpoint: config.metaEndpoint ?? oldEndpoints.meta ?? '/api/fs/get',
        pathField: config.pathField ?? 'path',
        cdnUrl: config.cdnUrl || '',
      }
    }

    default:
      return config
  }
}

function isRuntimeProviderConfigUsable(config: any): boolean {
  if (!config || !config.provider) {
    return false
  }

  switch (config.provider) {
    case 's3':
      return Boolean(
        config.endpoint &&
          config.bucket &&
          config.accessKeyId &&
          config.secretAccessKey,
      )
    case 'local':
      return Boolean(config.basePath)
    case 'openlist':
      return Boolean(config.baseUrl && config.rootPath && config.token)
    default:
      return false
  }
}
