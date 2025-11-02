import { DEFAULT_SETTINGS } from '../services/settings/contants'
import { settingsManager } from '../services/settings/settingsManager'

export default defineNitroPlugin(async (_nitroApp) => {
  const _settingsManager = settingsManager
  
  // Mark initialization phase to prevent storage provider switch triggers
  // until storage manager is properly initialized in plugin 2_storage.ts
  _settingsManager.setInitializingFlag(true)
  
  try {
    // Initialize default settings first
    await _settingsManager.init(DEFAULT_SETTINGS)
    
    // Migrate existing configurations from runtimeConfig
    // Note: Storage manager will be initialized in the next plugin (2_storage.ts)
    await migrateRuntimeConfigToSettings()
  } finally {
    _settingsManager.setInitializingFlag(false)
  }
})

/**
 * Migrate existing configurations from runtimeConfig to the settings system
 */
async function migrateRuntimeConfigToSettings() {
  const config = useRuntimeConfig()
  const _logger = logger.dynamic('settings-migration')
  
  try {
    // Migrate app settings
    if (config.public.app) {
      _logger.info('Migrating app settings')
      const appSettings = {
        title: config.public.app.title,
        slogan: config.public.app.slogan,
        author: config.public.app.author,
        avatarUrl: config.public.app.avatarUrl,
      }
      
      for (const [key, value] of Object.entries(appSettings)) {
        if (value) {
          try {
            await settingsManager.set('app', key as any, value, undefined, true)
            _logger.debug(`Migrated app.${key}`)
          } catch (error) {
            _logger.warn(`Failed to migrate app.${key}:`, error)
          }
        }
      }
    }
    
    // Migrate map settings
    if (config.public.map) {
      _logger.info('Migrating map settings')
      const mapSettings = {
        provider: config.public.map.provider,
        'mapbox.token': config.mapbox?.accessToken || '',
        'mapbox.style': config.public.map.mapbox?.style || '',
        'maplibre.token': config.public.map.maplibre?.token || '',
        'maplibre.style': config.public.map.maplibre?.style || '',
      }
      
      for (const [key, value] of Object.entries(mapSettings)) {
        if (value) {
          try {
            await settingsManager.set('map', key as any, value, undefined, true)
            _logger.debug(`Migrated map.${key}`)
          } catch (error) {
            _logger.warn(`Failed to migrate map.${key}:`, error)
          }
        }
      }
    }
    
    // Migrate storage configuration and set as active provider
    if (config.STORAGE_PROVIDER || config.provider) {
      _logger.info('Migrating storage configuration')
      
      const storageProvider = config.STORAGE_PROVIDER || 's3'
      const providerConfig = config.provider?.[storageProvider as keyof typeof config.provider]
      
      if (providerConfig) {
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
              config: normalizeProviderConfig(storageProvider, providerConfig),
            })
            
            // Set this as the active provider
            await settingsManager.set('storage', 'provider', providerId, undefined, true)
            _logger.info(
              `Storage provider migrated and set as active. Provider ID: ${providerId}`,
            )
          }
        } catch (error) {
          _logger.error('Failed to migrate storage provider:', error)
        }
      }
    }
    
    _logger.info('Configuration migration completed')
  } catch (error) {
    _logger.error('Failed to migrate configurations:', error)
  }
}

/**
 * Normalize provider configuration based on provider type
 */
function normalizeProviderConfig(
  provider: string,
  config: any,
): any {
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
        uploadEndpoint: config.uploadEndpoint ?? oldEndpoints.upload ?? '/api/fs/put',
        downloadEndpoint: config.downloadEndpoint ?? oldEndpoints.download,
        listEndpoint: config.listEndpoint ?? oldEndpoints.list,
        deleteEndpoint: config.deleteEndpoint ?? oldEndpoints.delete ?? '/api/fs/remove',
        metaEndpoint: config.metaEndpoint ?? oldEndpoints.meta ?? '/api/fs/get',
        pathField: config.pathField ?? 'path',
        cdnUrl: config.cdnUrl || '',
      }
    }
    
    default:
      return config
  }
}
