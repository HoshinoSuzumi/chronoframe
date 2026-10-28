import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import type {
  NewStorageProviderRow as NewSettingStorageProvider,
  StorageProviderRow as SettingStorageProvider,
} from '../../types/settings'
import type {
  SettingConfig,
  SettingType,
  SettingValue,
} from '#shared/types/settings'
import type { SettingKey, SettingNamespace } from './contants'
import { validateSettingWrite, createStorageResolver } from '@chronoframe/core'

export interface SettingsRuntimeEffects {
  settingChanged(change: {
    namespace: string
    key: string
    value: SettingValue
  }): void
  reloadStorageProvider(id: number): Promise<void>
}

export class SettingsManager {
  private runtimeEffects?: SettingsRuntimeEffects

  /** Attach application-owned effects; persistence itself does not own workers or storage instances. */
  setRuntimeEffects(effects: SettingsRuntimeEffects): void {
    this.runtimeEffects = effects
  }

  private static instance: SettingsManager
  protected settingsCache: Map<string, SettingValue> = new Map()
  protected _logger = logger.dynamic('settings-mgr')
  protected isInitializing = false

  private constructor() {}

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager()
    }
    return SettingsManager.instance
  }

  /**
   * Set the initializing flag externally
   * Used during plugin initialization to prevent storage provider switch triggers
   * @param flag Boolean flag to set
   */
  setInitializingFlag(flag: boolean): void {
    this.isInitializing = flag
  }

  /**
   * Check if currently initializing
   * @returns true if initializing, false otherwise
   */
  isInitializing_(): boolean {
    return this.isInitializing
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
    return `site:${DEFAULT_SITE.id}:${namespace}:${key}`
  }

  /**
   * Serialize setting value to string for storage
   * @param value Setting value
   * @returns Serialized string
   * @example
   * serialize(true) => 'true'
   * serialize({ theme: 'dark' }) => '{"theme":"dark"}'
   * serialize(null) => 'null'
   */
  private serialize(value: SettingValue): string | null {
    if (value === null) return null
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  /**
   * Deserialize setting value from string
   * @param value Serialized string or null
   * @param type Setting type
   * @returns Deserialized setting value
   * @example
   * deserialize('true', 'boolean') => true
   * deserialize('{"theme":"dark"}', 'json') => { theme: 'dark' }
   * deserialize('null', 'string') => null
   * deserialize(null, 'string') => null
   */
  private deserialize(value: string | null, type: SettingType): SettingValue {
    // Handle null or 'null' string value
    if (value === null || value === 'null') {
      return null
    }

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
          siteAnd(
            and(
              eq(tables.settings.namespace, config.namespace),
              eq(tables.settings.key, config.key),
            ),
            siteEq(tables.settings.siteId, DEFAULT_SITE.id),
          ),
        )
        .get()

      // If not exists and has default value, insert it
      if (!existing) {
        db.insert(tables.settings)
          .values({
            namespace: config.namespace,
            key: config.key,
            type: config.type,
            value: this.serialize(config.defaultValue),
            defaultValue: this.serialize(config.defaultValue),
            label: config.label,
            description: config.description,
            isPublic: config.isPublic,
            isReadonly: config.isReadonly,
            isSecret: config.isSecret,
            enum: config.enum ? [...config.enum] : null,
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
        siteAnd(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
          siteEq(tables.settings.siteId, DEFAULT_SITE.id),
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

  /**
   * Check whether a setting still holds its default value, i.e. it has never
   * been customized by the user (via the dashboard, the wizard, or a previous
   * runtime-config migration with a non-default value).
   * @returns true if the stored value equals the stored default value.
   *          Also true if the setting does not exist.
   */
  isDefault(
    namespace: SettingNamespace,
    key: SettingKey<typeof namespace>,
  ): boolean {
    const db = useDB()
    const setting = db
      .select({
        value: tables.settings.value,
        defaultValue: tables.settings.defaultValue,
      })
      .from(tables.settings)
      .where(
        siteAnd(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
          siteEq(tables.settings.siteId, DEFAULT_SITE.id),
        ),
      )
      .get()

    if (!setting) return true
    return setting.value === setting.defaultValue
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
        siteAnd(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
          siteEq(tables.settings.siteId, DEFAULT_SITE.id),
        ),
      )
      .get()

    if (!existing) {
      this._logger.warn(`Setting ${namespace}:${key} does not exist`)
      throw new Error(`Setting ${namespace}:${key} does not exist`)
    }

    validateSettingWrite({
      namespace,
      key,
      value,
      readonly: Boolean(existing.isReadonly),
      enumValues: existing.enum,
      sudo,
    })
    const serializedValue = this.serialize(value)

    db.update(tables.settings)
      .set({
        value: serializedValue,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      })
      .where(
        siteAnd(
          and(
            eq(tables.settings.namespace, namespace),
            eq(tables.settings.key, key),
          ),
          siteEq(tables.settings.siteId, DEFAULT_SITE.id),
        ),
      )
      .run()

    this._logger.info(`Setting ${namespace}:${key} updated`)
    this.settingsCache.set(cacheKey, value)
    if (!this.isInitializing)
      this.runtimeEffects?.settingChanged({ namespace, key, value })
  }

  async getNamespace(
    namespace: SettingNamespace,
  ): Promise<Record<string, SettingValue>> {
    const db = useDB()
    const settings = db
      .select()
      .from(tables.settings)
      .where(
        siteAnd(
          eq(tables.settings.namespace, namespace),
          siteEq(tables.settings.siteId, DEFAULT_SITE.id),
        ),
      )
      .all()

    const result: Record<string, SettingValue> = {}

    for (const setting of settings) {
      result[setting.key] = this.deserialize(setting.value, setting.type)
    }
    return result
  }

  async getSchema(): Promise<SettingConfig[]> {
    const db = useDB()
    const settings = db
      .select()
      .from(tables.settings)
      .where(siteEq(tables.settings.siteId, DEFAULT_SITE.id))
      .all()

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
      // 包含枚举值，过滤掉 null
      ...(setting.enum ? { enum: setting.enum } : {}),
    }))
  }

  // Storage Providers Management
  public storage = {
    async getProviders(): Promise<SettingStorageProvider[]> {
      const db = useDB()
      const providers = db
        .select()
        .from(tables.settings_storage_providers)
        .where(
          siteEq(tables.settings_storage_providers.siteId, DEFAULT_SITE.id),
        )
        .all()
      return providers
    },

    async getProviderById(id: number): Promise<SettingStorageProvider | null> {
      const db = useDB()
      const provider = db
        .select()
        .from(tables.settings_storage_providers)
        .where(
          siteAnd(
            eq(tables.settings_storage_providers.id, id),
            siteEq(tables.settings_storage_providers.siteId, DEFAULT_SITE.id),
          ),
        )
        .get()
      return provider || null
    },

    async getActiveProvider(): Promise<SettingStorageProvider | null> {
      return createStorageResolver({
        getSelectedId: () => settingsManager.get<number>('storage', 'provider'),
        find: (id) => this.getProviderById(id),
      }).resolve()
    },

    async addProvider(
      providerConfig: NewSettingStorageProvider,
    ): Promise<number> {
      const db = useDB()
      const result = db
        .insert(tables.settings_storage_providers)
        .values({
          name: providerConfig.name,
          provider: providerConfig.provider,
          config: providerConfig.config,
        })
        .run()

      // If no active provider and this is the only provider, set this as active
      const currentActiveProvider = await settingsManager.get<number>(
        'storage',
        'provider',
      )
      if (!currentActiveProvider && (await this.getProviders()).length === 1) {
        await settingsManager.set(
          'storage',
          'provider',
          result.lastInsertRowid as number,
        )
      }
      return result.lastInsertRowid as number
    },

    async updateProvider(
      id: number,
      providerConfig: Partial<NewSettingStorageProvider>,
    ): Promise<void> {
      const db = useDB()
      const reloadActiveProvider =
        !settingsManager.isInitializing_() &&
        (await settingsManager.get<number>('storage', 'provider')) === id
      const previousProvider = reloadActiveProvider
        ? await this.getProviderById(id)
        : null

      if (reloadActiveProvider && !previousProvider) {
        throw new Error(`Provider with ID ${id} not found`)
      }

      db.update(tables.settings_storage_providers)
        .set({
          ...providerConfig,
        })
        .where(
          siteAnd(
            eq(tables.settings_storage_providers.id, id),
            siteEq(tables.settings_storage_providers.siteId, DEFAULT_SITE.id),
          ),
        )
        .run()

      // Rebuild the active instance before saving completes so subsequent
      // requests use the updated configuration, including client credentials.
      if (previousProvider) {
        try {
          await settingsManager.runtimeEffects?.reloadStorageProvider(id)
        } catch (error) {
          // Provider construction leaves the existing instance untouched on
          // failure; restore its persisted configuration to match.
          try {
            db.update(tables.settings_storage_providers)
              .set({
                name: previousProvider.name,
                provider: previousProvider.provider,
                config: previousProvider.config,
              })
              .where(
                siteAnd(
                  eq(tables.settings_storage_providers.id, id),
                  siteEq(
                    tables.settings_storage_providers.siteId,
                    DEFAULT_SITE.id,
                  ),
                ),
              )
              .run()
          } catch (rollbackError) {
            settingsManager._logger.error(
              'Failed to roll back storage provider record:',
              rollbackError,
            )
          }
          throw error
        }
      }
    },

    async deleteProvider(id: number): Promise<void> {
      const db = useDB()
      db.delete(tables.settings_storage_providers)
        .where(
          siteAnd(
            eq(tables.settings_storage_providers.id, id),
            siteEq(tables.settings_storage_providers.siteId, DEFAULT_SITE.id),
          ),
        )
        .run()
    },
  }
}

export const settingsManager = SettingsManager.getInstance()
