/** Enable explicit platform endpoints only; never fall back to Self-hosted APIs. */
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
  const platformRoute =
    [
      '/api/auth/email/request',
      '/api/auth/email/verify',
      '/api/auth/status',
      '/api/auth/session',
      '/api/auth/logout',
    ].includes(path) || /^\/api\/sites\/[1-9][0-9]*\/context$/.test(path)
  if (platformRoute) return
  if (path === '/api' || (path.startsWith('/api/') && path !== '/api/health')) {
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' })
  }
})
