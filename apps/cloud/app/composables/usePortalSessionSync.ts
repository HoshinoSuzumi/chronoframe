import type { PortalIdentity } from './usePortalIdentity'

/** Revalidate visible portal sessions without mistaking freshness or network errors for logout. */
export function usePortalSessionSync() {
  const nuxtApp = useNuxtApp(),
    identity = usePortalIdentity(),
    context = useEntryContext(),
    catalog = useState('platform-site-catalog'),
    userId = useState<number | null>('platform-user-id'),
    settings = useSettingsStore()
  let pending = false,
    stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  async function check() {
    const account = identity.value?.id
    if (
      stopped ||
      pending ||
      !account ||
      document.visibilityState !== 'visible'
    )
      return
    pending = true
    try {
      let session: { authenticated: boolean; user: PortalIdentity | null }
      try {
        session = await $fetch('/api/auth/session', { timeout: 10000 })
      } catch {
        // A failed status request does not prove that the session has expired.
        return
      }
      if (
        stopped ||
        identity.value?.id !== account ||
        (session.authenticated && session.user?.id === account)
      )
        return
      nuxtApp.runWithContext(() => {
        clearNuxtData()
        context.value = null
        catalog.value = null
        userId.value = null
        identity.value = null
        settings.$reset()
      })
      await nuxtApp.runWithContext(() =>
        navigateTo(
          session.authenticated && session.user ? '/workspace' : '/signin',
          { external: true, replace: true },
        ),
      )
    } finally {
      pending = false
    }
  }
  onMounted(() => {
    void check()
    timer = setInterval(check, 60000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
  })
  onBeforeUnmount(() => {
    stopped = true
    clearInterval(timer)
    window.removeEventListener('focus', check)
    document.removeEventListener('visibilitychange', check)
  })
  return { check }
}
