export default defineNuxtRouteMiddleware((to) => {
  const path = to.path.toLowerCase()
  if (path === '/dashboard' || path.startsWith('/dashboard/'))
    return navigateTo('/signin', { redirectCode: 302 })
  if (path === '/sites' || path.startsWith('/sites/')) {
    return abortNavigation(
      createError({ statusCode: 503, statusMessage: 'Service unavailable' }),
    )
  }
})
