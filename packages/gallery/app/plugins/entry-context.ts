import { clearImageLoaderCache } from '../libs/image-loader-manager'
/** Drop tenant-owned client state before another Site is rendered. Preferences stay local. */
export default defineNuxtPlugin(() => {
  const context = useEntryContext()
  const settings = useSettingsStore()
  const viewer = useViewerState()
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
      clearNuxtData((key) => key.startsWith(`${previous}:fetch:`))
    },
    { flush: 'sync' },
  )
})
