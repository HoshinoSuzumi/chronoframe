import type {} from '../types/worker'
import type {
  SettingsManager,
  SettingsRuntimeEffects,
} from '../services/settings/settingsManager'
import { logger } from '../utils/logger'

/** Assemble post-persistence effects in the self-hosted application, not the settings service. */
export function createSettingsRuntimeEffects(
  settings: SettingsManager,
): SettingsRuntimeEffects {
  const runtimeLogger = logger.dynamic('settings-runtime')
  async function reloadStorageProvider(providerId: number): Promise<void> {
    try {
      // Dynamically import to avoid circular dependency issues
      const { getGlobalStorageManager, setGlobalStorageManager } =
        await import('../services/storage/events')
      const { StorageManager } = await import('../services/storage')
      const loggerModule = await import('../utils/logger')

      const newProvider = await settings.storage.getProviderById(providerId)
      if (!newProvider) {
        throw new Error(`Provider with ID ${providerId} not found`)
      }

      let storageManager = getGlobalStorageManager()
      if (!storageManager) {
        runtimeLogger.info(
          `Storage manager not initialized, bootstrapping with provider: ${newProvider.name} (ID: ${providerId})`,
        )
        try {
          storageManager = new StorageManager(
            newProvider.config,
            loggerModule.logger.dynamic('storage'),
          )
          if (newProvider.config.provider === 'local') {
            const fs = await import('node:fs/promises')
            await fs.mkdir(newProvider.config.basePath, { recursive: true })
          }

          setGlobalStorageManager(storageManager)
          runtimeLogger.info('Storage manager bootstrap completed')
          return
        } catch (bootstrapError) {
          runtimeLogger.error(
            'Failed to bootstrap storage manager with new provider:',
            bootstrapError,
          )
          throw bootstrapError
        }
      }

      runtimeLogger.info(
        `Triggering storage provider switch to: ${newProvider.name} (ID: ${providerId})`,
      )

      await storageManager.registerProvider(
        newProvider.config,
        loggerModule.logger.dynamic('storage'),
      )
    } catch (error) {
      runtimeLogger.error('Failed to switch storage provider:', error)
      throw error
    }
  }
  return {
    reloadStorageProvider,
    settingChanged({ namespace, key, value }) {
      if (namespace === 'system' && key === 'queue.workerCount') {
        void globalThis.__workerPool
          ?.setWorkerCount(value as number)
          .catch((error) => {
            runtimeLogger.error(
              'Failed to apply queue concurrency setting:',
              error,
            )
          })
      }
      if (namespace === 'storage' && key === 'provider') {
        setImmediate(() => {
          reloadStorageProvider(value as number).catch((error) =>
            runtimeLogger.error(
              'Failed to trigger storage provider switch:',
              error,
            ),
          )
        })
      }
    },
  }
}
