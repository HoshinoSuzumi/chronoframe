import type { SettingConfig } from '#shared/types/settings'

/**
 * The setup wizard only renders scalar settings. JSON settings (objects or
 * arrays, such as `socialLinks`) have no text representation and are edited
 * from the dashboard, which provides dedicated controls for them.
 */
export function isWizardRenderableField(
  field: Pick<SettingConfig, 'type' | 'value' | 'defaultValue'>,
): boolean {
  if (field.type === 'json') return false

  const value = field.value ?? field.defaultValue
  return value === null || typeof value !== 'object'
}
