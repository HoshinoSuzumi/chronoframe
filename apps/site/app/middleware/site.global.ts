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
  // Photo repositories are delivered in P4; never fall back to Self-hosted data.
  if (to.path !== '/') {
    context.value = null
    return abortNavigation(
      createError({
        statusCode: 503,
        statusMessage: 'Gallery content is not available yet',
      }),
    )
  }
})
