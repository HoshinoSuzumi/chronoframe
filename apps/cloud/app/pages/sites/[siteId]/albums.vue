<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.albumsChronoframeCloud'),
  robots: 'noindex',
})
</script>
<template><CloudAlbumsManager /></template>
