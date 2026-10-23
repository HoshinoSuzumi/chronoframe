/** One logout behavior for account settings and the portal account menu. */
export function useCloudSignOut() {
  const busy = ref(false),
    error = ref('')
  async function signOut() {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await $fetch('/api/auth/sign-out', { method: 'POST' })
      clearNuxtData()
      useEntryContext().value = null
      useState('platform-site-catalog').value = null
      useState('platform-user-id').value = null
      useSettingsStore().$reset()
      // Reset the document at the authentication boundary so no previous user's data survives.
      await navigateTo('/signin', { external: true })
    } catch {
      error.value = 'We could not sign you out. Please try again.'
    } finally {
      busy.value = false
    }
  }
  return { busy, error, signOut }
}
