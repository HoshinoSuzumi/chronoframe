/** Only trusted public context resolution is enabled; Self-hosted APIs stay unavailable. */
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
  if (
    path === '/api/public/context' ||
    /^\/api\/public\/albums\/[1-9][0-9]*\/(?:access|unlock)$/.test(path)
  )
    return
  if (path === '/api' || (path.startsWith('/api/') && path !== '/api/health')) {
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' })
  }
})
