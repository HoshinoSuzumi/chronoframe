<script setup lang="ts">
import type { EntrySiteContext } from '@chronoframe/contracts/entry'
definePageMeta({ key: (route) => route.fullPath })
useSeoMeta({ title: 'Manage site — ChronoFrame', robots: 'noindex' })
const context = useEntryContext()
const fetcher = useRequestFetch()
let stream: EventSource | undefined
watch(
  () => context.value?.scope,
  () => stream?.close(),
  { flush: 'sync' },
)
onMounted(() => {
  const snapshot = context.value
  if (!snapshot?.capabilities.subscriptions) return
  const invalidate = () => {
    stream?.close()
    if (context.value?.scope !== snapshot.scope) return
    context.value = null
    void navigateTo('/sites')
  }
  const updateContext = (update: EntrySiteContext) => {
    if (context.value?.scope !== snapshot.scope) return
    if (update.scope !== snapshot.scope) return invalidate()
    context.value = update
  }
  stream = new EventSource(`/api/sites/${snapshot.siteId}/events`)
  stream.addEventListener('context', (event) => {
    try {
      updateContext(JSON.parse((event as MessageEvent).data))
    } catch {
      invalidate()
    }
  })
  // A short stream reconnects every 15 seconds and rechecks live membership.
  stream.onerror = () => {
    void fetcher<EntrySiteContext>(`/api/sites/${snapshot.siteId}/context`)
      .then(updateContext)
      .catch(invalidate)
  }
})
onBeforeUnmount(() => stream?.close())
</script>
<template>
  <main class="cloud-message">
    <SiteContextCard /><NuxtLink to="/sites">Switch site</NuxtLink>
  </main>
</template>
