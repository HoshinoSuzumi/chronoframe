import { defineStore } from 'pinia'
import type { DebugSection, DebugValue } from '~/types/debug'

const storageKey = 'chronoframe:debug:v1'
export const useDebugStore = defineStore('debug', () => {
  const values = ref<Record<string, DebugValue>>({})
  const sections = shallowRef<Record<string, DebugSection>>({})
  const initialized = ref(false)
  function get<T extends DebugValue>(key: string, fallback: T): T {
    if (!import.meta.dev) return fallback
    const value = values.value[key]
    return value != null && typeof value === typeof fallback
      ? (value as T)
      : fallback
  }
  function set(key: string, value: DebugValue) {
    if (!import.meta.dev) return
    values.value = { ...values.value, [key]: value }
  }
  function reset() {
    values.value = {}
  }
  function initialize() {
    if (!import.meta.dev || !import.meta.client || initialized.value) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        values.value = Object.fromEntries(
          Object.entries(saved).filter(
            ([, value]) =>
              value === null ||
              typeof value === 'string' ||
              typeof value === 'boolean' ||
              (typeof value === 'number' && Number.isFinite(value)),
          ),
        ) as Record<string, DebugValue>
      }
    } catch {
      /* A corrupt or unavailable storage must not block the app. */
    }
    initialized.value = true
    watch(
      values,
      (value) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(value))
        } catch {
          /* Storage may be disabled. */
        }
      },
      { deep: true },
    )
  }
  function register(section: DebugSection) {
    if (!import.meta.dev) return
    sections.value = { ...sections.value, [section.id]: section }
  }
  function unregister(id: string) {
    const next = { ...sections.value }
    delete next[id]
    sections.value = next
  }
  return {
    values,
    sections,
    initialized,
    get,
    set,
    reset,
    initialize,
    register,
    unregister,
  }
})
