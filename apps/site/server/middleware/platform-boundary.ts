/** No Self-hosted fallback before platform authorization and Site resolution exist. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  let path: string
  try {
    path = decodeURIComponent(getRequestURL(event).pathname).toLowerCase()
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request path',
    })
  }
  if (path === '/api' || (path.startsWith('/api/') && path !== '/api/health')) {
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' })
  }
})
