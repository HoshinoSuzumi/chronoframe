import { defineStore } from 'pinia'

type SettingValue = string | number | boolean | null | Record<string, any>

interface SettingsState {
  data: Record<string, Record<string, SettingValue>>
  isInitialized: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * 设置存储 - 使用 Pinia
 *
 * 使用方式：
 * 1. 在 app.vue 中调用 await useSettingsStore().initSettings()
 * 2. 在任何组件中使用 getSetting() 或 useSettingRef()
 *
 * @example
 * // 在 app.vue 中
 * const settingsStore = useSettingsStore()
 * await settingsStore.initSettings()
 *
 * // 在组件中
 * const mapProvider = getSetting('map:provider')
 * const appTitle = useSettingRef('app:title')
 */
export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    data: {},
    isInitialized: false,
    isLoading: false,
    error: null,
  }),

  getters: {
    /**
     * 获取初始化状态
     */
    isReady: (state) => state.isInitialized && !state.isLoading,

    /**
     * 获取错误状态
     */
    getError: (state) => state.error,
  },

  actions: {
    /**
     * 从服务器一次性加载所有设置
     */
    async initSettings(): Promise<void> {
      if (this.isInitialized) {
        return
      }

      this.isLoading = true
      this.error = null

      try {
        const response = await $fetch<{
          timestamp: number
          data: Record<string, Record<string, SettingValue>>
        }>('/api/system/settings/all')

        this.data = response.data
        this.isInitialized = true
      } catch (error) {
        this.error = error as Error
        console.error('[Settings] Failed to initialize settings:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 同步获取单个设置或整个命名空间
     * @param key - 'namespace:key' 格式获取单个值，或 'namespace' 格式获取整个命名空间
     * @returns 设置值，如果不存在返回 null
     */
    getSetting(key: string): SettingValue {
      if (!this.isInitialized) {
        console.warn(
          '[Settings] Settings not initialized yet. Call await initSettings() first.',
        )
        return null
      }

      // 如果包含冒号，是 'namespace:key' 格式
      if (key.includes(':')) {
        const parts = key.split(':')
        const namespace = parts[0]
        const settingKey = parts[1]
        if (namespace && settingKey) {
          const namespaceObj = this.data[namespace]
          if (namespaceObj) {
            return (namespaceObj as any)[settingKey] ?? null
          }
        }
        return null
      }

      // 否则是命名空间格式，返回整个命名空间对象
      return this.data[key] ?? null
    },

    /**
     * 刷新设置
     */
    async refreshSettings(): Promise<void> {
      this.isLoading = true
      this.error = null

      try {
        const response = await $fetch<{
          timestamp: number
          data: Record<string, Record<string, SettingValue>>
        }>('/api/system/settings/all')

        this.data = response.data
        this.isInitialized = true
      } catch (error) {
        this.error = error as Error
        console.error('[Settings] Failed to refresh settings:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },
  },
})

/**
 * 全局辅助函数 - 同步获取设置
 * @param key - 'namespace:key' 或 'namespace'
 * @returns 设置值
 *
 * @example
 * getSetting('map:provider')
 * getSetting('map')
 */
export function getSetting(key: string): SettingValue {
  const store = useSettingsStore()
  return store.getSetting(key)
}

/**
 * 全局辅助函数 - 响应式获取设置
 * @param key - 'namespace:key' 或 'namespace'
 * @returns ComputedRef 响应式引用
 *
 * @example
 * const appTitle = useSettingRef('app:title')
 */
export function useSettingRef(key: string) {
  const store = useSettingsStore()
  return computed(() => store.getSetting(key))
}

/**
 * 全局辅助函数 - 检查设置是否就绪
 */
export function isSettingsReady(): boolean {
  const store = useSettingsStore()
  return store.isReady
}

/**
 * 全局辅助函数 - 刷新设置
 */
export async function refreshSettings(): Promise<void> {
  const store = useSettingsStore()
  await store.refreshSettings()
}
