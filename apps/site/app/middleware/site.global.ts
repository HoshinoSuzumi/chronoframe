import { isAlbumPagePath } from '@chronoframe/gallery/shared/utils/albumPath'

export default defineNuxtRouteMiddleware(async (to) => {
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
  try {
    context.value = await useRequestFetch()('/api/public/context')
  } catch (error) {
    context.value = null
    return abortNavigation(error as Error)
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
