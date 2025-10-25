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
      case 'github':
        // TODO: Implement GitHub storage provider
        throw new Error('GitHub storage provider not implemented yet')
      default:
        throw new Error(`Unknown storage provider`)
    }
  }
}

export class StorageManager {
  private providers: Map<string, StorageProvider>
  private defaultKey: string

  constructor(config: StorageConfig, logger?: Logger['storage']) {
    this.providers = new Map()
    this.defaultKey = config.provider
    logger?.info(`Creating storage provider: ${config.provider}`)
    this.providers.set(
      config.provider,
      StorageProviderFactory.createProvider(config, logger),
    )
  }

  registerProvider(key: StorageConfig['provider'], config: StorageConfig, logger?: Logger['storage']) {
    // key 用于请求时选择，通常与 config.provider 相同
    this.providers.set(
      key,
      StorageProviderFactory.createProvider(config, logger),
    )
  }

  setDefault(key: string) {
    if (!this.providers.has(key)) {
      throw new Error(`Default storage provider '${key}' not registered`)
    }
    this.defaultKey = key
  }

  getAvailableKeys(): string[] {
    return Array.from(this.providers.keys())
  }

  getProvider<T extends StorageProvider>(key?: string) {
    const k = key || this.defaultKey
    const provider = this.providers.get(k)
    if (!provider) {
      throw new Error(`Storage provider '${k}' not registered`)
    }
    return provider as T
  }
}
