import type * as schema from '../../server/database/schema'

export type SettingType = typeof schema.settings.$inferSelect.type
export type SettingValue = string | number | boolean | Record<string, any> | null

export type SettingConfig = Omit<
  typeof schema.settings.$inferInsert,
  'value' | 'defaultValue' | 'id' | 'updatedAt' | 'updatedBy' | 'enum'
> & {
  value?: SettingValue
  defaultValue: SettingValue
  enum?: string[]
}

export type SettingStorageProvider = typeof schema.settings_storage_providers.$inferSelect
export type NewSettingStorageProvider = typeof schema.settings_storage_providers.$inferInsert
