<script setup lang="ts">
import { motion } from 'motion-v'
import {
  ArrowLeft,
  ArrowUpRight,
  Images,
  ImagePlus,
  ShieldCheck,
} from 'lucide-vue-next'
const entrance = useCloudMotion()

import type { EntrySiteContext } from '@chronoframe/contracts/entry'
definePageMeta({ key: (route) => route.fullPath })
useSeoMeta({ title: 'Manage site — ChronoFrame Cloud', robots: 'noindex' })
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
  <CloudPortalShell
    ><motion.div
      v-if="context"
      v-bind="entrance"
    >
      <NuxtLink
        to="/sites"
        class="cf-back-link"
        ><ArrowLeft :size="14" />All sites</NuxtLink
      >
      <div class="cf-page-heading">
        <div class="cf-detail-header">
          <span class="cf-site-icon"><Images :size="20" /></span>
          <div>
            <h1 class="cf-page-title">{{ context.name }}</h1>
            <p class="cf-page-description">Gallery settings and access.</p>
          </div>
        </div>
        <CloudBadge :tone="context.published ? 'success' : 'neutral'">{{
          context.published ? 'Published' : 'Draft'
        }}</CloudBadge>
      </div>
      <dl class="cf-site-facts">
        <div>
          <dt>Your role</dt>
          <dd class="cf-capitalize">{{ context.role }}</dd>
        </div>
        <div>
          <dt>Publication</dt>
          <dd>{{ context.published ? 'Published' : 'Private draft' }}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd><ShieldCheck :size="13" />Membership verified</dd>
        </div>
      </dl>
      <div class="cf-site-workbench">
        <CloudSiteSettings :site-id="context.siteId" />
        <aside
          v-if="!context.capabilities.mediaManagement"
          class="cf-workbench-note"
          aria-label="Photo management information"
        >
          <span class="cf-note-icon"><ImagePlus :size="18" /></span>
          <h2>Photo management</h2>
          <p>
            Storage, uploads and new publishing options are coming in the next
            stage.
          </p>
          <a href="https://docs.chronoframe.art/"
            >Read the documentation<ArrowUpRight :size="13"
          /></a>
        </aside>
      </div> </motion.div
  ></CloudPortalShell>
</template>
