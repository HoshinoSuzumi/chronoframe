<script setup lang="ts">
import { ArrowUpRight, Settings, Globe } from 'lucide-vue-next'
const activeContext = useEntryContext()
const context = shallowRef(activeContext.value)
// Preserve the outgoing header, while accepting live updates for this Site only.
watch(activeContext, (next) => {
  if (next?.scope === context.value?.scope) context.value = next
})
const { admin, busy, photos, publish } = useCloudSiteMedia()
const { data } = useFetch<{ site: { slug: string | null } }>(
  `/api/sites/${context.value?.siteId}/settings`,
)
const host = computed(() =>
  data.value?.site.slug ? `${data.value.site.slug}.site.chronoframe.art` : '',
)
</script>
<template>
  <div class="cf-site-page-header">
    <div class="cf-site-heading">
      <h1>{{ context?.name }}</h1>
      <div class="cf-site-publication">
        <CloudBadge :tone="context?.published ? 'success' : 'neutral'">{{
          context?.published ? 'Published' : 'Private draft'
        }}</CloudBadge
        ><span>{{ host }}</span>
      </div>
    </div>
    <div class="cf-site-page-actions">
      <CloudButton
        v-if="host && context?.published"
        as-child
        variant="ghost"
        size="sm"
        ><a
          :href="`https://${host}`"
          target="_blank"
          rel="noopener noreferrer"
          >View site<ArrowUpRight :size="14" /></a></CloudButton
      ><CloudButton
        v-if="admin"
        variant="secondary"
        size="sm"
        :disabled="busy || (!photos.length && !context?.published)"
        @click="publish(!context?.published)"
        ><Globe :size="14" />{{
          context?.published ? 'Unpublish' : 'Publish gallery'
        }}</CloudButton
      ><CloudButton
        as-child
        variant="ghost"
        size="icon"
        ><NuxtLink
          :to="`/sites/${context?.siteId}/settings`"
          aria-label="Site settings"
          ><Settings :size="17" /></NuxtLink
      ></CloudButton>
    </div>
    <p
      v-if="!context?.published"
      class="cf-draft-hint"
    >
      Your gallery is private. Publish it when you are ready to share.
    </p>
  </div>
</template>
