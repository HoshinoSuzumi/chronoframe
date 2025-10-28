import type { StorageConfig, StorageProvider } from '.';
import { S3StorageProvider } from '.'
import type { Logger } from '../../utils/logger'
import { HubR2StorageProvider } from './providers/hub-r2'
import { LocalStorageProvider } from './providers/local'
import { OpenListStorageProvider } from './providers/openlist'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StorageProviderFactory {
  static createProvider(
    config: StorageConfig,
    logger?: Logger['storage'],
  ): StorageProvider {
    switch (config.provider) {
      case 's3':
        return new S3StorageProvider(config, logger)
      case 'hub-r2':
        return new HubR2StorageProvider(config, logger)
      case 'local':
        return new LocalStorageProvider(config, logger)
      case 'openlist':
        return new OpenListStorageProvider(config as any, logger)
      default:
        throw new Error(`Unknown storage provider`)
    }
  }
}

export class StorageManager {
  private provider: StorageProvider

  constructor(config: StorageConfig, logger?: Logger['storage']) {
    logger?.info(`Creating storage provider: ${config.provider}`)
    this.provider = StorageProviderFactory.createProvider(config, logger)
  }

  registerProvider(config: StorageConfig, logger?: Logger['storage']) {
    logger?.info(`Registering storage provider: ${config.provider}`)
    this.provider = StorageProviderFactory.createProvider(config, logger)
  }

  getProvider<T extends StorageProvider>() {
    if (!this.provider) {
      throw new Error(`Storage provider not registered`)
    }

    return this.provider as T
  }
}
