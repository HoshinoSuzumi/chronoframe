<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useSeoMeta({ title: 'Site information — ChronoFrame Cloud', robots: 'noindex' })
const site = useEntryContext().value!
</script>
<template>
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">Site information</h1>
        <p class="cf-page-description">
          Your gallery’s identity and public profile.
        </p>
      </div>
    </div>
    <CloudSiteSettings :site-id="site.siteId" />
  </div>
</template>
