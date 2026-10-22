export default defineNuxtRouteMiddleware(async (to) => {
  const path = to.path.toLowerCase()
  const context = useEntryContext()
  context.value = null
  if (path === '/' && useRequestURL().hostname === 'app.chronoframe.art')
    return navigateTo('/sites', { redirectCode: 302 })
  if (path === '/dashboard' || path.startsWith('/dashboard/'))
    return navigateTo('/sites', { redirectCode: 302 })
  if (path === '/sites' || path.startsWith('/sites/')) {
    const fetcher = useRequestFetch()
    const session = await fetcher('/api/auth/session')
    if (!session.authenticated)
      return navigateTo('/signin', { redirectCode: 302 })
    if (path !== '/sites') {
      const match = /^\/sites\/([1-9][0-9]*)$/.exec(path)
      if (!match)
        return abortNavigation(
          createError({ statusCode: 404, statusMessage: 'Page not found' }),
        )
      try {
        context.value = await fetcher(`/api/sites/${match[1]}/context`)
      } catch (error) {
        return abortNavigation(error as Error)
      }
    }
  }
})
