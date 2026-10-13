export default defineNuxtRouteMiddleware(async (to) => {
  const settings = useSettingsStore()
  if (!settings.isReady) {
    try {
      await settings.initSettings()
    } catch (error) {
      return abortNavigation(error instanceof Error ? error : String(error))
    }
  }

  const showAlbums = settings.getSetting('app:homeView') === 'albums'

  if (showAlbums && typeof to.query.tag === 'string') {
    return navigateTo({ path: '/photos', query: to.query })
  }
})
