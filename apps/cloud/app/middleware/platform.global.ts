import type {
  EntrySiteCatalog,
  EntrySiteSummary,
} from '@chronoframe/contracts/entry'
export default defineNuxtRouteMiddleware(async (to) => {
  const path = to.path.toLowerCase()
  const context = useEntryContext()
  const catalog = useState<EntrySiteCatalog | null>(
    'platform-site-catalog',
    () => null,
  )
  if (path === '/' && useRequestURL().hostname === 'app.chronoframe.art')
    return navigateTo('/sites', { redirectCode: 302 })
  if (path === '/dashboard' || path.startsWith('/dashboard/'))
    return navigateTo('/sites', { redirectCode: 302 })
  if (['/signin', '/signup'].includes(path)) {
    const session = await useRequestFetch()<{ authenticated: boolean }>(
      '/api/auth/session',
    ).catch(() => null)
    if (session?.authenticated)
      return navigateTo('/sites', { redirectCode: 302 })
  }
  if (
    (path === '/pricing' &&
      (useRequestURL().hostname === 'app.chronoframe.art' ||
        to.query.portal === '1')) ||
    path === '/account' ||
    path.startsWith('/account/') ||
    path === '/sites' ||
    path.startsWith('/sites/')
  ) {
    const fetcher = useRequestFetch()
    const session = await fetcher<{
      authenticated: boolean
      user: { id: number; name?: string | null; email?: string } | null
    }>('/api/auth/session').catch((error) => {
      if ([401, 403].includes(error.statusCode ?? error.status))
        return { authenticated: false, user: null }
      context.value = null
      throw error
    })
    usePortalIdentity().value = session.user
    useState<number | null>('platform-user-id', () => null).value =
      session.user?.id ?? null
    if (!session.authenticated || !session.user) {
      context.value = null
      return navigateTo('/signin', { redirectCode: 302 })
    }
    if (path === '/sites') {
      const result = await fetcher<{ sites: EntrySiteSummary[] }>('/api/sites')
      catalog.value = { userId: session.user.id, sites: result.sites }
    }
    if (path.startsWith('/sites/')) {
      const match =
        /^\/sites\/([1-9][0-9]*)(?:\/(?:overview|photos|albums|information|domains|storage|settings))?$/.exec(
          path,
        )
      if (!match)
        return abortNavigation(
          createError({ statusCode: 404, statusMessage: 'Page not found' }),
        )
      try {
        context.value = await fetcher(`/api/sites/${match[1]}/context`)
        // Resolve legacy URLs before mounting a nested page/Suspense boundary.
        if (
          path === `/sites/${match[1]}` ||
          path === `/sites/${match[1]}/settings`
        )
          return navigateTo(
            `/sites/${match[1]}/${path.endsWith('/settings') ? 'information' : 'overview'}`,
            {
              replace: true,
              redirectCode: 302,
            },
          )
      } catch (error) {
        context.value = null
        return abortNavigation(error as Error)
      }
    }
  }
  // Keep the current view intact while authorization and destination data load.
  // The next page must still start without a previous Site's authority.
  if (!path.startsWith('/sites/')) context.value = null
})
