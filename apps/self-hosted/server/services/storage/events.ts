import type { StorageManager } from './manager'

/**
 * Global storage manager for non-request context
 */
let globalStorageManager: StorageManager | null = null

/**
 * Set the global storage manager instance
 * @param storageManager StorageManager instance
 */
export function setGlobalStorageManager(storageManager: StorageManager): void {
  globalStorageManager = storageManager
}

/**
 * Get the global storage manager instance
 * @returns StorageManager instance or null if not initialized
 */
export function getGlobalStorageManager(): StorageManager | null {
  return globalStorageManager
}

/**
 * Check if storage manager is initialized
 * @returns true if storage manager is initialized
 */
export function isStorageManagerInitialized(): boolean {
  return globalStorageManager !== null
}
