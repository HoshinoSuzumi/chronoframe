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
  if (
    to.path !== '/' &&
    to.path !== '/albums' &&
    !/^\/albums\/[1-9][0-9]*$/.test(to.path)
  )
    return abortNavigation(createError({ statusCode: 404 }))
})
