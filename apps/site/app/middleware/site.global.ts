/** A default Site is never inferred from an untrusted request Host. */
export default defineNuxtRouteMiddleware((to) => {
  const path = to.path.toLowerCase()
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return abortNavigation(
      createError({ statusCode: 404, statusMessage: 'Page not found' }),
    )
  }
  return abortNavigation(
    createError({ statusCode: 503, statusMessage: 'Service unavailable' }),
  )
})
