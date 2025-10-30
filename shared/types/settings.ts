import type * as schema from '../../server/database/schema'

export type SettingType = typeof schema.settings.$inferSelect.type
export type SettingValue = string | number | boolean | Record<string, any> | null

export type SettingConfig = Omit<
  typeof schema.settings.$inferInsert,
  'value' | 'defaultValue' | 'id' | 'updatedAt' | 'updatedBy'
> & {
  value?: SettingValue
  defaultValue: SettingValue
}
