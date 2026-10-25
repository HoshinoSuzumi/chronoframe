<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useSeoMeta({ title: 'Storage — ChronoFrame Cloud', robots: 'noindex' })
</script>
<template>
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">Storage</h1>
        <p class="cf-page-description">
          Choose where your gallery’s media lives.
        </p>
      </div>
    </div>
    <CloudStorageSettings /><CloudCard
      ><div class="cf-panel-heading">
        <h2>Platform storage</h2>
        <CloudBadge>Coming later</CloudBadge>
        <p>
          Managed storage and plan allowances are not available yet. Connect
          your own private S3-compatible bucket above to get started.
        </p>
      </div></CloudCard
    >
  </div>
</template>
