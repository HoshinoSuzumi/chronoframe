import type {
  SettingConfig,
  SettingType,
  SettingValue,
} from '~~/shared/types/settings'
import type { SettingKey, SettingNamespace } from './contants'

export class SettingsManager {
  private static instance: SettingsManager
  private settingsCache: Map<string, SettingValue> = new Map()
  private _logger = logger.dynamic('settings-mgr')

  private constructor() {}

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager()
    }
    return SettingsManager.instance
  }

  /**
   * Generate cache key for a setting
   * @param namespace
   * @param key
   * @returns Cache key string
   * @example
   * getCacheKey('app', 'theme') => 'app:theme'
   */
  private getCacheKey(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
  ): string {
    return `${namespace}:${key}`
  }

  /**
   * Serialize setting value to string for storage
   * @param value Setting value
   * @returns Serialized string
   * @example
   * serialize(true) => 'true'
   * serialize({ theme: 'dark' }) => '{"theme":"dark"}'
   */
  private serialize(value: SettingValue): string {
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  /**
   * Deserialize setting value from string
   * @param value Serialized string
   * @param type Setting type
   * @returns Deserialized setting value
   * @example
   * deserialize('true', 'boolean') => true
   * deserialize('{"theme":"dark"}', 'json') => { theme: 'dark' }
   */
  private deserialize(value: string, type: SettingType): SettingValue {
    switch (type) {
      case 'string':
        return value
      case 'number':
        return Number(value)
      case 'boolean':
        return value === 'true'
      default:
        return JSON.parse(value)
    }
  }

  /**
   * Initialize settings manager with default settings
   * @param configs Array of setting configurations
   */
  async init(configs: SettingConfig[]): Promise<void> {
    const db = useDB()

    this._logger.info('Initializing settings manager with default settings')

    for (const config of configs) {
      // Skip if namespace or key is missing
      if (!config.namespace || !config.key) {
        this._logger.warn('Skipping config with missing namespace or key')
        continue
      }

      // Check if setting exists
      const existing = db
        .select()
        .from(tables.settings)
        .where(
          and(
            eq(tables.settings.namespace, config.namespace),
            eq(tables.settings.key, config.key),
          ),
        )
        .get()

      // If not exists and has default value, insert it
      if (!existing && config.defaultValue !== null) {
        db.insert(tables.settings)
          .values({
            namespace: config.namespace,
            key: config.key,
            type: config.type,
            value: this.serialize(config.defaultValue),
            defaultValue: this.serialize(config.defaultValue),
            label: config.label,
            description: config.description,
            isInternal: config.isInternal ? 1 : 0,
            isReadonly: config.isReadonly ? 1 : 0,
            isSecret: config.isSecret ? 1 : 0,
          })
          .run()
      }
    }
  }

  async get<T = SettingValue>(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
    defaultValue?: T,
  ): Promise<T | null> {
    const cacheKey = this.getCacheKey(namespace, key)

    // Check cache first
    if (this.settingsCache.has(cacheKey)) {
      this._logger.debug(`Cache hit for setting ${cacheKey}`)
      return this.settingsCache.get(cacheKey) as T
    }

    // If not in cache, fetch from database
    const db = useDB()
    const setting = db
      .select()
      .from(tables.settings)
      .where(
        and(
          eq(tables.settings.namespace, namespace),
          eq(tables.settings.key, key),
        ),
      )
      .get()

    // If not found, return default value
    if (!setting) {
      this._logger.debug(
        `Setting ${cacheKey} not found, returning default value`,
      )
      return defaultValue ?? null
    }

    this._logger.debug(`Setting ${cacheKey} fetched from database`)
    const value = this.deserialize(setting.value, setting.type)
    this.settingsCache.set(cacheKey, value)

    return value as T
  }

  async set(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
    value: SettingValue,
    updatedBy?: number,
    sudo = false,
  ): Promise<void> {
    const db = useDB()
    const cacheKey = this.getCacheKey(namespace, key)

    const existing = db
      .select()
      .from(tables.settings)
      .where(
        and(
          eq(tables.settings.namespace, namespace),
          eq(tables.settings.key, key),
        ),
      )
      .get()

    if (!existing) {
      this._logger.warn(`Setting ${namespace}:${key} does not exist`)
      throw new Error(`Setting ${namespace}:${key} does not exist`)
    }

    if (existing.isReadonly && !sudo) {
      this._logger.warn(
        `Attempt to modify readonly setting ${namespace}:${key}`,
      )
      throw new Error(`Setting ${namespace}:${key} is readonly`)
    }

    const serializedValue = this.serialize(value)

    db.update(tables.settings)
      .set({
        value: serializedValue,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      })
      .where(
        and(
          eq(tables.settings.namespace, namespace),
          eq(tables.settings.key, key),
        ),
      )
      .run()

    this._logger.info(`Setting ${namespace}:${key} updated`)
    this.settingsCache.set(cacheKey, value)
  }

  async getNamespace(namespace: SettingNamespace): Promise<Record<string, SettingValue>> {
    const db = useDB()
    const settings = db
      .select()
      .from(tables.settings)
      .where(eq(tables.settings.namespace, namespace))
      .all()

    const result: Record<string, SettingValue> = {}

    for (const setting of settings) {
      result[setting.key] = this.deserialize(setting.value, setting.type)
    }
    return result
  }

  async getSchema(): Promise<SettingConfig[]> {
    const db = useDB()
    const settings = db.select().from(tables.settings).all()

    return settings.map((setting) => ({
      namespace: setting.namespace,
      key: setting.key,
      type: setting.type,
      value: this.deserialize(setting.value, setting.type),
      defaultValue:
        setting.defaultValue &&
        this.deserialize(setting.defaultValue, setting.type),
      label: setting.label,
      description: setting.description,
      isReadonly: setting.isReadonly,
      isSecret: setting.isSecret,
    }))
  }
}

export const settingsManager = SettingsManager.getInstance()
