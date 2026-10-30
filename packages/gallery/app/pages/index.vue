<script setup lang="ts">
definePageMeta({
  middleware: 'home-tag-redirect',
  layout: 'masonry',
})

const { homeView } = useHomeView()
</script>

<template>
  <AlbumListing v-if="homeView === 'albums'" />
  <div v-else />
</template>
