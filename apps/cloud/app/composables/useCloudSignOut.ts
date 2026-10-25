/** One logout behavior for account settings and the portal account menu. */
export function useCloudSignOut() {
  const { t } = useI18n()
  const nuxtApp = useNuxtApp(),
    context = useEntryContext(),
    catalog = useState('platform-site-catalog'),
    userId = useState('platform-user-id'),
    identity = usePortalIdentity(),
    settings = useSettingsStore()
  const busy = ref(false),
    error = ref('')
  async function signOut() {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await $fetch('/api/auth/sign-out', { method: 'POST' })
      nuxtApp.runWithContext(() => {
        clearNuxtData()
        context.value = null
        catalog.value = null
        userId.value = null
        identity.value = null
        settings.$reset()
      })
      // Reset the document at the authentication boundary.
      await nuxtApp.runWithContext(() =>
        navigateTo('/signin', { external: true }),
      )
    } catch {
      error.value = t('cloud.messages.weCouldNotSignYouOutPleaseTryAgain')
    } finally {
      busy.value = false
    }
  }
  return { busy, error, signOut }
}
