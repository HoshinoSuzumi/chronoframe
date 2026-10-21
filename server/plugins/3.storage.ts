import path from 'node:path'
import type { LocalStorageConfig, StorageConfig } from '../services/storage'
import { StorageManager, getGlobalStorageManager } from '../services/storage'
import { setGlobalStorageManager } from '../services/storage/events'
import { logger } from '../utils/logger'
import { settingsManager } from '../services/settings/settingsManager'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isLocalStorageProvider = (
  provider: StorageConfig,
): provider is LocalStorageConfig => {
  return provider?.provider === 'local'
}

async function ensureLocalStorageReady(provider: StorageConfig): Promise<void> {
  if (!isLocalStorageProvider(provider)) {
    return
  }

  const localBase = provider.basePath
  try {
    if (!path.isAbsolute(localBase)) {
      logger.storage.warn(`LOCAL basePath is not absolute: ${localBase}`)
    }
    await import('node:fs').then(async (m) => {
      const fs = m.promises as typeof import('node:fs').promises
      await fs.mkdir(localBase, { recursive: true })
    })
    logger.storage.success(`Local storage ready at: ${localBase}`)
  } catch (err) {
    logger.storage.error('Failed to prepare local storage directory', err)
  }
}

function attachStorageManagerEvents(storageManager: StorageManager): void {
  storageManager.on('provider-changed', async (event) => {
    logger.storage.info(
      `Storage provider changed from ${event.oldProvider} to ${event.provider}`,
    )

    if (event.provider === 'local') {
      try {
        const newProvider = await settingsManager.storage.getActiveProvider()
        if (newProvider) {
          await ensureLocalStorageReady(newProvider.config)
        }
      } catch (error) {
        logger.storage.error('Failed to initialize local storage:', error)
      }
    }
  })

  storageManager.on('provider-error', (event) => {
    logger.storage.error(
      `Storage provider error for ${event.provider}: ${event.error?.message}`,
    )
  })
}

export async function initializeStorageManagerFromActiveProvider(
  reason = 'startup',
): Promise<boolean> {
  if (getGlobalStorageManager()) {
    return true
  }

  // Wait for settings migration to complete if still initializing
  let activeProvider = await settingsManager.storage.getActiveProvider()
  if (!activeProvider) {
    let attempts = 0
    const maxAttempts = 100 // 5 seconds max with 50ms intervals

    while (
      !activeProvider &&
      attempts < maxAttempts &&
      settingsManager.isInitializing_()
    ) {
      await wait(50)
      activeProvider = await settingsManager.storage.getActiveProvider()
      attempts++
    }
  }

  if (!activeProvider) {
    logger.storage.info(
      `Storage manager init skipped (${reason}): no active storage provider configured yet.`,
    )
    return false
  }

  try {
    const storageManager = new StorageManager(
      activeProvider.config,
      logger.storage,
    )
    setGlobalStorageManager(storageManager)
    attachStorageManagerEvents(storageManager)
    await ensureLocalStorageReady(activeProvider.config)
    logger.storage.success(
      `Storage manager initialized (${reason}) with provider: ${activeProvider.config.provider}`,
    )
    return true
  } catch (error) {
    logger.storage.error(
      `Failed to initialize storage manager (${reason}) with provider ${activeProvider.config.provider}`,
      error,
    )
    return false
  }
}

/**
 * Get the global storage manager instance
 * Used in non-request context (e.g., background tasks, event handlers)
 */
export function getStorageManager() {
  const storageManager = getGlobalStorageManager()
  if (!storageManager) {
    throw new Error('Storage manager not initialized')
  }
  return storageManager
}

export default nitroPlugin(async (nitroApp) => {
  // Try eager initialization on startup, but do not fail the app if provider
  // is missing or invalid before onboarding completes.
  await initializeStorageManagerFromActiveProvider('startup')

  // Always resolve storage manager from global state per-request so late
  // onboarding configuration can initialize storage without container restart.
  nitroApp.hooks.hook('request', async (event) => {
    let storageManager = getGlobalStorageManager()
    if (!storageManager) {
      await initializeStorageManagerFromActiveProvider('request')
      storageManager = getGlobalStorageManager()
    }

    if (storageManager) {
      event.context.storage = storageManager
    }
  })

  logger.storage.info('Storage plugin initialized with lazy bootstrap support')
})
