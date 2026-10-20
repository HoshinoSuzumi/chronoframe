import type * as schema from '../database/schema'
export type StorageProviderRow =
  typeof schema.settings_storage_providers.$inferSelect
export type NewStorageProviderRow =
  typeof schema.settings_storage_providers.$inferInsert
