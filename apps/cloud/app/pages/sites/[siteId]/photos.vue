<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.photosChronoframeCloud'),
  robots: 'noindex',
})
</script>
<template><CloudPhotoLibrary /></template>
