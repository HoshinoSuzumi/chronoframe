import type { EntrySiteContext } from '@chronoframe/contracts/entry'
/** Persist one membership-checked stream across sibling site pages. */
export function useCloudSiteSubscription() {
  const context = useEntryContext(),
    fetcher = useRequestFetch()
  let stream: EventSource | undefined,
    mounted = false
  function connect() {
    stream?.close()
    const snapshot = context.value
    if (
      !mounted ||
      !snapshot?.capabilities.subscriptions ||
      snapshot.audience !== 'portal'
    )
      return
    const current = new EventSource(`/api/sites/${snapshot.siteId}/events`)
    stream = current
    const invalidate = () => {
      current.close()
      if (
        mounted &&
        stream === current &&
        context.value?.scope === snapshot.scope
      ) {
        context.value = null
        void navigateTo('/sites')
      }
    }
    const update = (next: EntrySiteContext) => {
      if (
        !mounted ||
        stream !== current ||
        context.value?.scope !== snapshot.scope
      )
        return
      if (next.scope !== snapshot.scope) return invalidate()
      context.value = next
    }
    stream.addEventListener('context', (event) => {
      try {
        update(JSON.parse((event as MessageEvent).data))
      } catch {
        invalidate()
      }
    })
    stream.onerror = () => {
      void fetcher<EntrySiteContext>(`/api/sites/${snapshot.siteId}/context`)
        .then(update)
        .catch(invalidate)
    }
  }
  watch(() => context.value?.scope, connect, { flush: 'sync' })
  onMounted(() => {
    mounted = true
    connect()
  })
  onBeforeUnmount(() => {
    mounted = false
    stream?.close()
  })
}
