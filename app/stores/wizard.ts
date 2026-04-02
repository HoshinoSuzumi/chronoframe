import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useWizardStore = defineStore('wizard', () => {
  const database = ref(
    useLocalStorage<Record<string, any>>('wizard-database', {}),
  )
  const admin = ref(useLocalStorage<Record<string, any>>('wizard-admin', {}))
  const site = ref(useLocalStorage<Record<string, any>>('wizard-site', {}))
  const storage = ref(
    useLocalStorage<Record<string, any>>('wizard-storage', {}),
  )
  const map = ref(useLocalStorage<Record<string, any>>('wizard-map', {}))

  const updateDatabase = (data: Record<string, any>) => {
    database.value = { ...database.value, ...data }
  }

  const updateAdmin = (data: Record<string, any>) => {
    admin.value = { ...admin.value, ...data }
  }

  const updateSite = (data: Record<string, any>) => {
    site.value = { ...site.value, ...data }
  }

  const updateStorage = (data: Record<string, any>) => {
    storage.value = { ...storage.value, ...data }
  }

  const updateMap = (data: Record<string, any>) => {
    map.value = { ...map.value, ...data }
  }

  const clear = () => {
    database.value = {}
    admin.value = {}
    site.value = {}
    storage.value = {}
    map.value = {}
  }

  return {
    database,
    admin,
    site,
    storage,
    map,
    updateDatabase,
    updateAdmin,
    updateSite,
    updateStorage,
    updateMap,
    clear,
  }
})
