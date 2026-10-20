export type { StorageProvider, StorageObject } from './interfaces'

export {
  s3StorageConfigSchema,
  localStorageConfigSchema,
  openListStorageConfigSchema,
  storageConfigSchema,
} from '@chronoframe/contracts/storage'

export type {
  S3StorageConfig,
  LocalStorageConfig,
  OpenListStorageConfig,
  StorageConfig,
} from '@chronoframe/contracts/storage'

export { StorageProviderFactory, StorageManager } from './manager'

export type {
  StorageManagerEventType,
  StorageManagerEventListener,
  StorageManagerEvent,
} from './manager'

export { S3StorageProvider } from './providers/s3'
export { LocalStorageProvider } from './providers/local'
export { OpenListStorageProvider } from './providers/openlist'

export {
  setGlobalStorageManager,
  getGlobalStorageManager,
  isStorageManagerInitialized,
} from './events'
