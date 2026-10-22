export default defineNuxtRouteMiddleware((to) => {
  const path = to.path.toLowerCase()
  // The portal host never renders the marketing homepage. Do not infer login
  // from a shared/self-hosted cookie; platform identity is connected separately.
  if (path === '/' && useRequestURL().hostname === 'app.chronoframe.art') {
    return navigateTo('/signin', { redirectCode: 302 })
  }
  if (path === '/dashboard' || path.startsWith('/dashboard/'))
    return navigateTo('/signin', { redirectCode: 302 })
  if (path === '/sites' || path.startsWith('/sites/')) {
    return abortNavigation(
      createError({ statusCode: 503, statusMessage: 'Service unavailable' }),
    )
  }
})
