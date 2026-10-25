<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useSeoMeta({ title: 'Overview — ChronoFrame Cloud', robots: 'noindex' })
const site = useEntryContext().value!
const { photos, albums, jobs, loading } = useCloudSiteMedia()
const processingCount = computed(
  () =>
    jobs.value.filter((job: { state: string }) =>
      ['queued', 'running', 'retry_wait'].includes(job.state),
    ).length,
)
</script>
<template>
  <div>
    <CloudSitePublication />
    <div
      class="cf-overview-stats"
      :aria-busy="loading"
    >
      <CloudCard
        ><div class="cf-panel-body">
          <span class="cf-field-label">Photographs</span
          ><strong>{{ loading ? '—' : photos.length }}</strong
          ><NuxtLink
            :to="`/sites/${site.siteId}/photos`"
            class="cf-text-link"
            >Open photo library</NuxtLink
          >
        </div></CloudCard
      ><CloudCard
        ><div class="cf-panel-body">
          <span class="cf-field-label">Albums</span
          ><strong>{{ loading ? '—' : albums.length }}</strong
          ><NuxtLink
            :to="`/sites/${site.siteId}/albums`"
            class="cf-text-link"
            >Manage albums</NuxtLink
          >
        </div></CloudCard
      ><CloudCard
        ><div class="cf-panel-body">
          <span class="cf-field-label">Processing</span
          ><strong>{{ loading ? '—' : processingCount }}</strong>
          <p class="cf-field-hint">
            Upload and processing details are in your photo library.
          </p>
        </div></CloudCard
      >
    </div>
  </div>
</template>
