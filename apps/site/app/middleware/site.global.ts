import { isAlbumPagePath } from '@chronoframe/gallery/shared/utils/albumPath'

export default defineNuxtRouteMiddleware(async (to, from) => {
  const context = useEntryContext()
  if (
    to.path.toLowerCase() === '/dashboard' ||
    to.path.toLowerCase().startsWith('/dashboard/')
  ) {
    context.value = null
    return abortNavigation(
      createError({ statusCode: 404, statusMessage: 'Page not found' }),
    )
  }
  // The viewer is an overlay over the existing gallery, not a new Site visit.
  // Re-resolving context here delays every photo transition and can leave a
  // close navigation racing the still-pending open navigation.
  const isWall = (path: string) => path === '/' || path === '/photos'
  const isViewerNavigation =
    from.matched.length > 0 &&
    ((to.name === 'slug' && (from.name === 'slug' || isWall(from.path))) ||
      (from.name === 'slug' && isWall(to.path)) ||
      (to.path === from.path &&
        isAlbumPagePath(to.path) &&
        (typeof to.query.photo === 'string' ||
          typeof from.query.photo === 'string')))
  if (!context.value || !isViewerNavigation) {
    try {
      context.value = await useRequestFetch()('/api/public/context')
    } catch (error) {
      context.value = null
      return abortNavigation(error as Error)
    }
  }
  if (to.path === '/signin')
    return navigateTo('https://app.chronoframe.art/signin', { external: true })
  if (
    !['/photos', '/globe'].includes(to.path) &&
    !/^\/[a-zA-Z0-9_-]{1,128}$/.test(to.path) &&
    to.path !== '/' &&
    to.path !== '/albums' &&
    !isAlbumPagePath(to.path)
  )
    return abortNavigation(createError({ statusCode: 404 }))
})
