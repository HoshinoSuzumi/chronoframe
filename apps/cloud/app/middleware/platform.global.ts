import type {
  EntrySiteCatalog,
  EntrySiteSummary,
} from '@chronoframe/contracts/entry'
export default defineNuxtRouteMiddleware(async (to) => {
  const path = to.path.toLowerCase()
  const context = useEntryContext()
  context.value = null
  const catalog = useState<EntrySiteCatalog | null>(
    'platform-site-catalog',
    () => null,
  )
  catalog.value = null
  if (path === '/' && useRequestURL().hostname === 'app.chronoframe.art')
    return navigateTo('/sites', { redirectCode: 302 })
  if (path === '/dashboard' || path.startsWith('/dashboard/'))
    return navigateTo('/sites', { redirectCode: 302 })
  if (path === '/sites' || path.startsWith('/sites/')) {
    const fetcher = useRequestFetch()
    const session = await fetcher<{
      authenticated: boolean
      user: { id: number } | null
    }>('/api/auth/session').catch((error) => {
      if ([401, 403].includes(error.statusCode ?? error.status))
        return { authenticated: false, user: null }
      throw error
    })
    useState<number | null>('platform-user-id', () => null).value =
      session.user?.id ?? null
    if (!session.authenticated || !session.user)
      return navigateTo('/signin', { redirectCode: 302 })
    if (path === '/sites') {
      const result = await fetcher<{ sites: EntrySiteSummary[] }>('/api/sites')
      catalog.value = { userId: session.user.id, sites: result.sites }
    }
    if (path !== '/sites') {
      const match = /^\/sites\/([1-9][0-9]*)$/.exec(path)
      if (!match)
        return abortNavigation(
          createError({ statusCode: 404, statusMessage: 'Page not found' }),
        )
      try {
        context.value = await fetcher(`/api/sites/${match[1]}/context`)
      } catch (error) {
        return abortNavigation(error as Error)
      }
    }
  }
})
