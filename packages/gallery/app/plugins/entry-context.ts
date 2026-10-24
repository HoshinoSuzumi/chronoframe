import { clearImageLoaderCache } from '../libs/image-loader-manager'
/** Drop tenant-owned client state before another Site is rendered. Preferences stay local. */
export default defineNuxtPlugin((nuxtApp) => {
  const context = useEntryContext()
  const settings = useSettingsStore()
  const viewer = useViewerState()
  const retiredScopes = new Set<string>()
  // Suspense keeps the outgoing page mounted until the destination is ready.
  // Clearing its async data earlier changes its visible content during navigation.
  nuxtApp.hook('page:finish', () => {
    for (const scope of retiredScopes) {
      if (scope !== context.value?.scope)
        clearNuxtData((key) => key.startsWith(`${scope}:fetch:`))
    }
    retiredScopes.clear()
  })
  watch(
    () => context.value?.scope,
    (scope, previous) => {
      if (scope === previous) return
      if (import.meta.client) clearImageLoaderCache()
      settings.$reset()
      viewer.scopedPhotos = null
      viewer.isViewerOpen = false
      viewer.currentPhotoIndex = 0
      viewer.isDirectAccess = false
      viewer.clearReturnRoute()
      if (previous) retiredScopes.add(previous)
    },
    { flush: 'sync' },
  )
})
