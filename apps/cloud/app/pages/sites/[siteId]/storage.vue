<script setup lang="ts">
const { t } = useI18n()

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
    <CloudStorageSettings /><CloudCard
      ><div class="cf-panel-heading">
        <h2>{{ $t('cloud.messages.platformStorage') }}</h2>
        <CloudBadge>{{ $t('cloud.messages.comingLater') }}</CloudBadge>
        <p>
          {{
            $t(
              'cloud.messages.managedStorageAndPlanAllowancesAreNotAvailableYet',
            )
          }}
        </p>
      </div></CloudCard
    >
  </div>
</template>
