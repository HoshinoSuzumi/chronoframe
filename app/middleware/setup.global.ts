import { useSettingsStore } from '~/stores/settings'

export default defineNuxtRouteMiddleware(async (to, _from) => {
  const settingsStore = useSettingsStore()

  // Ensure settings are loaded
  if (!settingsStore.isReady) {
    try {
      await settingsStore.initSettings()
    } catch (e) {
      console.error('Failed to load settings in middleware', e)
    }
  }

  const isFirstLaunch = settingsStore.getSetting('system:firstLaunch')
  const isOnboarding = to.path.startsWith('/onboarding')

  if (isFirstLaunch === true) {
    if (!isOnboarding) {
      return navigateTo('/onboarding')
    }
  } else {
    if (isOnboarding) {
      // ignore
    }
  }
})
