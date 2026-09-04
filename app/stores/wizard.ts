import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const useWizardStore = defineStore('wizard', () => {
  const admin = ref(useLocalStorage<Record<string, any>>('wizard-admin', {}))
  const site = ref(useLocalStorage<Record<string, any>>('wizard-site', {}))
  const storage = ref(
    useLocalStorage<Record<string, any>>('wizard-storage', {}),
  )
  const map = ref(useLocalStorage<Record<string, any>>('wizard-map', {}))
  const completedSteps = ref(
    useLocalStorage<number[]>('wizard-completed-steps', [0]),
  )

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
  const markStepAccessible = (step: number) => {
    if (!completedSteps.value.includes(step)) {
      completedSteps.value = [...completedSteps.value, step]
    }
  }

  const clear = () => {
    admin.value = {}
    site.value = {}
    storage.value = {}
    map.value = {}
    completedSteps.value = [0]
  }

  return {
    admin,
    site,
    storage,
    map,
    completedSteps,
    updateAdmin,
    updateSite,
    updateStorage,
    updateMap,
    markStepAccessible,
    clear,
  }
})
