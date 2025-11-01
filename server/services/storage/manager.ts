import type { StorageConfig, StorageProvider } from '.';
import { S3StorageProvider } from '.'
import type { Logger } from '../../utils/logger'
import { LocalStorageProvider } from './providers/local'
import { OpenListStorageProvider } from './providers/openlist'

export type StorageManagerEventType = 'provider-changed' | 'provider-error'

export interface StorageManagerEventListener {
  (event: StorageManagerEvent): void | Promise<void>
}

export interface StorageManagerEvent {
  type: StorageManagerEventType
  provider?: string
  oldProvider?: string
  error?: Error
  timestamp: number
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StorageProviderFactory {
  static createProvider(
    config: StorageConfig,
    logger?: Logger['storage'],
  ): StorageProvider {
    switch (config.provider) {
      case 's3':
        return new S3StorageProvider(config, logger)
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
  private logger?: Logger['storage']
  private eventListeners: Map<StorageManagerEventType, StorageManagerEventListener[]> = new Map()
  private currentProviderName?: string

  constructor(config: StorageConfig, logger?: Logger['storage']) {
    this.logger = logger
    this.logger?.info(`Creating storage provider: ${config.provider}`)
    this.currentProviderName = config.provider
    this.provider = StorageProviderFactory.createProvider(config, logger)
  }

  /**
   * Register event listener for storage manager events
   * @param eventType Type of event to listen for
   * @param listener Event listener callback
   */
  public on(
    eventType: StorageManagerEventType,
    listener: StorageManagerEventListener,
  ): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, [])
    }
    this.eventListeners.get(eventType)!.push(listener)
    this.logger?.debug(`Event listener registered for: ${eventType}`)
  }

  /**
   * Unregister event listener
   * @param eventType Type of event
   * @param listener Event listener callback
   */
  public off(
    eventType: StorageManagerEventType,
    listener: StorageManagerEventListener,
  ): void {
    const listeners = this.eventListeners.get(eventType)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
        this.logger?.debug(`Event listener unregistered for: ${eventType}`)
      }
    }
  }

  /**
   * Emit event to all registered listeners
   * @param event Event to emit
   */
  private async emitEvent(event: StorageManagerEvent): Promise<void> {
    const listeners = this.eventListeners.get(event.type) || []
    for (const listener of listeners) {
      try {
        await listener(event)
      } catch (error) {
        this.logger?.error(`Error in event listener for ${event.type}:`, error)
      }
    }
  }

  /**
   * Register/switch storage provider
   * @param config New storage configuration
   * @param logger Optional logger instance
   */
  async registerProvider(config: StorageConfig, logger?: Logger['storage']): Promise<void> {
    try {
      const oldProviderName = this.currentProviderName
      this.logger = logger || this.logger
      
      this.logger?.info(`Switching storage provider from ${oldProviderName} to ${config.provider}`)
      
      const newProvider = StorageProviderFactory.createProvider(config, this.logger)
      this.provider = newProvider
      this.currentProviderName = config.provider
      
      this.logger?.success(`Storage provider switched to: ${config.provider}`)
      
      // Emit provider-changed event
      await this.emitEvent({
        type: 'provider-changed',
        provider: config.provider,
        oldProvider: oldProviderName,
        timestamp: Date.now(),
      })
    } catch (error) {
      this.logger?.error(`Failed to register storage provider: ${config.provider}`, error)
      
      // Emit provider-error event
      await this.emitEvent({
        type: 'provider-error',
        provider: config.provider,
        error: error as Error,
        timestamp: Date.now(),
      })
      
      throw error
    }
  }

  /**
   * Get current storage provider
   */
  getProvider<T extends StorageProvider>(): T {
    if (!this.provider) {
      throw new Error(`Storage provider not registered`)
    }
    return this.provider as T
  }

  /**
   * Get current provider name
   */
  getCurrentProviderName(): string | undefined {
    return this.currentProviderName
  }
}
