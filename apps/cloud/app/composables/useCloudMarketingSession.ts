/** Host-only portal cookies stay on the portal; the website receives only a boolean. */
export function useCloudMarketingSession() {
  const links = useCloudLinks()
  const authenticated = ref(false)
  let generation = 0,
    disposed = false,
    controller: AbortController | undefined
  async function refresh() {
    const current = ++generation
    controller?.abort()
    controller = new AbortController()
    const requestController = controller
    const timeout = setTimeout(() => requestController.abort(), 5000)
    try {
      const result = await $fetch<{ authenticated: boolean }>(
        links.marketingSession,
        {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        },
      )
      if (!disposed && current === generation)
        authenticated.value = result.authenticated === true
    } catch {
      if (!disposed && current === generation) authenticated.value = false
    } finally {
      clearTimeout(timeout)
    }
  }
  const resume = () => {
    void refresh()
  }
  const visibility = () => {
    if (document.visibilityState === 'visible') resume()
  }
  onMounted(() => {
    resume()
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', visibility)
  })
  onBeforeUnmount(() => {
    disposed = true
    generation++
    controller?.abort()
    window.removeEventListener('focus', resume)
    window.removeEventListener('pageshow', resume)
    document.removeEventListener('visibilitychange', visibility)
  })
  return { authenticated }
}
