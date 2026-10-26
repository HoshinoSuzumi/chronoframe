<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.overviewChronoframeCloud'),
  robots: 'noindex',
})
const site = useEntryContext().value!
const { photos, albums, jobs, loading, ready } = useCloudSiteMedia()
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
          <span class="cf-field-label">{{
            $t('cloud.messages.photographs')
          }}</span
          ><strong>{{ ready ? photos.length : '—' }}</strong
          ><NuxtLink
            :to="`/sites/${site.siteId}/photos`"
            class="cf-text-link"
            >{{ $t('cloud.messages.openPhotoLibrary') }}</NuxtLink
          >
        </div></CloudCard
      ><CloudCard
        ><div class="cf-panel-body">
          <span class="cf-field-label">{{ $t('cloud.messages.albums') }}</span
          ><strong>{{ ready ? albums.length : '—' }}</strong
          ><NuxtLink
            :to="`/sites/${site.siteId}/albums`"
            class="cf-text-link"
            >{{ $t('cloud.messages.manageAlbums') }}</NuxtLink
          >
        </div></CloudCard
      ><CloudCard
        ><div class="cf-panel-body">
          <span class="cf-field-label">{{
            $t('cloud.messages.processing')
          }}</span
          ><strong>{{ ready ? processingCount : '—' }}</strong>
          <p class="cf-field-hint">
            {{
              $t(
                'cloud.messages.uploadAndProcessingDetailsAreInYourPhotoLibrary',
              )
            }}
          </p>
        </div></CloudCard
      >
    </div>
  </div>
</template>
