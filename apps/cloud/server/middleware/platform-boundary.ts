import { accountRouteAllowed } from '../utils/account-routes'
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
      '/api/auth/status',
      '/api/auth/session',
      '/api/auth/logout',
      '/api/auth/security',
      '/api/sites',
      '/api/billing/catalog',
      '/api/legal/terms',
      '/api/legal/privacy',
      '/api/billing/workspaces',
      '/api/billing/plan',
      '/api/billing/redeem',
      '/api/billing/payments',
      '/api/webhooks/creem',
      '/api/workspaces/default',
    ].includes(path) ||
    /^\/api\/webhooks\/dodo\/[a-z][a-z0-9_-]{0,63}$/.test(path) ||
    /^\/api\/sites\/[1-9][0-9]*\/(?:context|events|settings|domains)$/.test(
      path,
    )
  if (
    /^\/api\/sites\/[1-9][0-9]*\/media(?:\/|$)/.test(path) ||
    /^\/api\/internal\/worker\/(?:claim|heartbeat|grant|complete|fail|cleanup)$/.test(
      path,
    )
  )
    return
  if (platformRoute || accountRouteAllowed(path, event.method)) return
  if (path === '/api' || (path.startsWith('/api/') && path !== '/api/health')) {
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' })
  }
})
