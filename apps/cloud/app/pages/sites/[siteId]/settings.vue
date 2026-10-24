<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useSeoMeta({ title: 'Site settings — ChronoFrame Cloud', robots: 'noindex' })
const context = useEntryContext()
</script>
<template>
  <div class="cf-site-settings-stack">
    <CloudSiteSettings
      v-if="context"
      :site-id="context.siteId"
    /><CloudStorageSettings />
  </div>
</template>
