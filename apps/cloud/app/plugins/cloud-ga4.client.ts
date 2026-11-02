/** Cloud marketing analytics; tenant galleries and the account portal are separate audiences. */
export default defineNuxtPlugin((app) => {
  const domain = String(useRuntimeConfig().public.siteBaseDomain)
  if (![domain, `www.${domain}`].includes(window.location.hostname)) return
  const { initialize } = useGtag()
  onNuxtReady(async () => {
    try {
      const { measurementId } = await $fetch<{ measurementId: string }>(
        '/api/cloud-analytics',
        { timeout: 5000, retry: 0 },
      )
      if (/^G-[A-Z0-9]{4,20}$/.test(measurementId))
        app.runWithContext(() => initialize(measurementId))
    } catch {
      // Optional analytics must never prevent the website from loading.
    }
  })
})
