<script setup lang="ts">
const DebugPanel = import.meta.dev
  ? defineAsyncComponent(() => import('#gallery/components/debug/Panel.vue'))
  : null
</script>
<template>
  <GalleryApplication>
    <NuxtLayout><NuxtPage /></NuxtLayout>
    <template #overlays
      ><AdminTours /><component
        :is="DebugPanel"
        v-if="DebugPanel"
    /></template>
  </GalleryApplication>
</template>
