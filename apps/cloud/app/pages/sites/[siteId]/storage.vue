<script setup lang="ts">
const { t } = useI18n()
const { allowance, loadError } = useCloudSiteMedia()

definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.storageChronoframeCloud'),
  robots: 'noindex',
})
</script>
<template>
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ $t('cloud.messages.storage') }}</h1>
        <p class="cf-page-description">
          {{ $t('cloud.messages.chooseWhereYourGallerySMediaLives') }}
        </p>
      </div>
    </div>
    <CloudPlatformStorageCard
      :allowance="allowance"
      :error="loadError"
    />
    <CloudStorageSettings />
  </div>
</template>
