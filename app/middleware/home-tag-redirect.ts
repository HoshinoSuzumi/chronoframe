export default defineNuxtRouteMiddleware((to) => {
  const settings = useSettingsStore()
  const showAlbums = settings.getSetting('app:homeView') === 'albums'

  if (showAlbums && typeof to.query.tag === 'string') {
    return navigateTo({ path: '/photos', query: to.query })
  }
})
