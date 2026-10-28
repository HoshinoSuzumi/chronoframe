<script setup lang="ts">
const { t } = useI18n()
const { allowance } = useCloudSiteMedia()

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
    <CfCard
      ><div class="cf-panel-heading">
        <h2>{{ $t('cloud.messages.platformStorage') }}</h2>
        <CfBadge>{{ allowance?.plan.name ?? '—' }}</CfBadge>
        <p>{{ $t('cloud.storageAllowance.description') }}</p>
        <p v-if="allowance">
          {{ (allowance.storageBytes / 1048576).toFixed(1) }} MiB /
          {{ (allowance.limits.storageBytes! / 1048576).toFixed(0) }} MiB
        </p>
      </div></CfCard
    >
    <CloudStorageSettings />
  </div>
</template>
