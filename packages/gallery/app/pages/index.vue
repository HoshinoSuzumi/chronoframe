<script setup lang="ts">
definePageMeta({
  middleware: 'home-tag-redirect',
})

const { homeView } = useHomeView()
</script>

<template>
  <AlbumListing v-if="homeView === 'albums'" />
  <NuxtLayout
    v-else
    name="masonry"
  >
    <div />
  </NuxtLayout>
</template>
