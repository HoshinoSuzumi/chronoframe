import { useSettingsStore } from '~/stores/settings'

export default defineNuxtRouteMiddleware(async (to, _from) => {
  const settingsStore = useSettingsStore()
  const isOnboarding = to.path.startsWith('/onboarding')
  let dbConfigured = true

  try {
    const bootstrap = await $fetch<{
      configured: boolean
    }>('/api/wizard/bootstrap-db')
    dbConfigured = bootstrap.configured
  } catch (error) {
    console.warn('Failed to check bootstrap database config', error)
    dbConfigured = false
  }

  if (!dbConfigured && to.path !== '/onboarding/database') {
    return navigateTo('/onboarding/database')
  }

  // Ensure settings are loaded
  if (!settingsStore.isReady) {
    try {
      await settingsStore.initSettings()
    } catch (e) {
      console.error('Failed to load settings in middleware', e)
    }
  }

  const isFirstLaunch = settingsStore.getSetting('system:firstLaunch')
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
