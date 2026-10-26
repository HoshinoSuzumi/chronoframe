import { domainEligibility } from '../../../../packages/platform/src/domain-policy'
import { createError, getRequestURL, sendRedirect, setResponseHeader } from 'h3'
import { validSiteSlug } from '@chronoframe/contracts/domains'
import {
  platformDatabase,
  platformRequestURL,
} from '../../../shared/platform/runtime'
import { publicSiteContext } from '../../../shared/platform/context'

/** Redirect documents only; cookies and private media remain bound to the requesting Host. */
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  setResponseHeader(event, 'Cache-Control', 'no-store')
  let normalizedPath: string
  try {
    normalizedPath = decodeURIComponent(path).toLowerCase()
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request path',
    })
  }
  if (
    // Nuxt renders errors through an internal request without Worker bindings.
    // Let its renderer preserve the original status instead of resolving the Site again.
    normalizedPath === '/__nuxt_error' ||
    normalizedPath === '/api' ||
    normalizedPath.startsWith('/api/') ||
    path.startsWith('/_nuxt/')
  )
    return
  const url = platformRequestURL(event),
    runtime = useRuntimeConfig(event),
    base = runtime.public.siteBaseDomain,
    host = url.hostname
  if (
    host === base ||
    host === 'chronoframe.art' ||
    [
      'app',
      'docs',
      'cname',
      'www',
      'api',
      'admin',
      'auth',
      'mail',
      'noreply',
      'status',
    ].some((label) => host === label + '.' + base)
  )
    throw createError({ statusCode: 404 })
  if (
    host.endsWith('.' + base) &&
    host.slice(0, -base.length - 1).split('.').length === 1 &&
    !validSiteSlug(host.slice(0, -base.length - 1))
  )
    throw createError({ statusCode: 404 })
  const context = await publicSiteContext(event)
  if (!['GET', 'HEAD'].includes(event.method)) return
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/dashboard' ||
    path.startsWith('/dashboard/')
  ) {
    const origin = new URL(runtime.platform.portalOrigin)
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== runtime.platform.portalOrigin
    )
      throw createError({ statusCode: 503 })
    return sendRedirect(
      event,
      origin.origin + '/sites/' + context.site.id + '/overview',
      302,
    )
  }
  const db = platformDatabase(event)
  const primary = await db
    .prepare(
      `SELECT hostname FROM platform_custom_domains WHERE site_id=? AND state='active' AND is_primary=1 AND redirects=1 AND verified_at>=?`,
    )
    .bind(context.site.id, Date.now() - 3600000)
    .first<{ hostname: string }>()
  if (
    primary &&
    primary.hostname !== host &&
    (await domainEligibility(db, primary.hostname)).allowed
  )
    return sendRedirect(
      event,
      'https://' + primary.hostname + url.pathname + url.search,
      302,
    )
  const alias = await db
    .prepare(
      'SELECT redirect_to,kind,redirect_until FROM platform_domains WHERE hostname=? AND site_id=?',
    )
    .bind(host, context.site.id)
    .first<{
      redirect_to: string | null
      kind: string
      redirect_until: number | null
    }>()
  if (
    alias?.redirect_to &&
    alias.redirect_to !== host &&
    ((alias.kind === 'alias' && Number(alias.redirect_until) > Date.now()) ||
      (alias.kind === 'legacy' &&
        String(runtime.public.defaultDomainsReady) === 'true'))
  )
    return sendRedirect(
      event,
      'https://' + alias.redirect_to + url.pathname + url.search,
      302,
    )
  if (
    url.protocol === 'http:' &&
    (alias?.kind === 'custom' ||
      (alias?.kind === 'default' &&
        String(runtime.public.defaultDomainsReady) === 'true'))
  )
    return sendRedirect(
      event,
      'https://' + host + url.pathname + url.search,
      308,
    )
})
