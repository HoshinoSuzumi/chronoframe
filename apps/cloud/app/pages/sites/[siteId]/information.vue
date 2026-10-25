<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.siteInformationChronoframeCloud'),
  robots: 'noindex',
})
const site = useEntryContext().value!
</script>
<template>
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">
          {{ $t('cloud.messages.siteInformation') }}
        </h1>
        <p class="cf-page-description">
          {{ $t('cloud.messages.yourGallerySIdentityAndPublicProfile') }}
        </p>
      </div>
    </div>
    <CloudSiteSettings :site-id="site.siteId" />
  </div>
</template>
