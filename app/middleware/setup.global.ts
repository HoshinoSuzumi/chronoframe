import { useSettingsStore } from '~/stores/settings'

export default defineNuxtRouteMiddleware(async (to, _from) => {
  const settingsStore = useSettingsStore()
  const isOnboarding = to.path.startsWith('/onboarding')
  let dbConfigured = false
  let onboardingRequired = true

  try {
    const status = await $fetch<{
      dbConfigured: boolean
      onboardingRequired: boolean
    }>('/api/wizard/status')
    dbConfigured = status.dbConfigured
    onboardingRequired = status.onboardingRequired
  } catch (error) {
    console.warn('Failed to check wizard status', error)
    dbConfigured = false
    onboardingRequired = true
  }

  // Database not initialized yet: force database onboarding step first.
  if (!dbConfigured && to.path !== '/onboarding/database') {
    return navigateTo('/onboarding/database')
  }

  // Database initialized but onboarding not completed: skip database step,
  // and force all non-onboarding routes back to onboarding.
  if (dbConfigured && onboardingRequired && to.path === '/onboarding/database') {
    return navigateTo('/onboarding/admin')
  }

  if (dbConfigured && onboardingRequired && !isOnboarding) {
    return navigateTo('/onboarding/admin')
  }

  // Only initialize settings if database is configured and not in onboarding
  if (dbConfigured && !isOnboarding && !settingsStore.isReady) {
    try {
      await settingsStore.initSettings()
    } catch (e) {
      console.error('Failed to load settings in middleware', e)
      // Don't throw - allow navigation to continue
    }
  }

  // Backward-compatible fallback for places still reading this flag from store.
  if (onboardingRequired && !isOnboarding) {
    return navigateTo('/onboarding')
  }
})
