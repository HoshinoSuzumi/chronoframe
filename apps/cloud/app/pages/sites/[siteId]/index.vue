<script setup lang="ts">
import { motion } from 'motion-v'
import { ArrowLeft, Images, ImagePlus, ShieldCheck } from 'lucide-vue-next'
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
      ><NuxtLink
        to="/sites"
        class="cf-back-link"
        ><ArrowLeft :size="15" />All sites</NuxtLink
      >
      <div class="cf-page-heading">
        <div class="cf-detail-header">
          <span class="cf-site-icon"
            ><Images
              :size="26"
              :stroke-width="1.5"
          /></span>
          <div>
            <p class="cf-eyebrow">SITE OVERVIEW</p>
            <h1 class="cf-page-title">{{ context.name }}</h1>
          </div>
        </div>
        <CloudBadge :tone="context.published ? 'success' : 'warning'">{{
          context.published ? 'Published' : 'Not published'
        }}</CloudBadge>
      </div>
      <CloudCard class="cf-details"
        ><dl>
          <div class="cf-detail-row">
            <dt>Your role</dt>
            <dd class="cf-capitalize">{{ context.role }}</dd>
          </div>
          <div class="cf-detail-row">
            <dt>Publication status</dt>
            <dd>{{ context.published ? 'Published' : 'Not published' }}</dd>
          </div>
          <div class="cf-detail-row">
            <dt>Access</dt>
            <dd class="cf-inline-status">
              <ShieldCheck :size="14" />Membership verified
            </dd>
          </div>
        </dl></CloudCard
      >
      <CloudSiteSettings :site-id="context.siteId" />
      <CloudCard
        v-if="!context.capabilities.mediaManagement"
        class="cf-empty"
        ><div class="cf-empty-icon">
          <ImagePlus
            :size="27"
            :stroke-width="1.4"
          />
        </div>
        <h2>A space for what comes next.</h2>
        <p>
          Photo storage, uploads and publishing are coming in the next stage.
          For now, you can review your site and membership details here.
        </p>
        <CloudButton
          as-child
          variant="secondary"
          ><a href="https://docs.chronoframe.art/"
            >Read the documentation</a
          ></CloudButton
        ></CloudCard
      >
    </motion.div></CloudPortalShell
  >
</template>
