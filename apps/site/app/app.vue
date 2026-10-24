<script setup lang="ts">
// Resolve Host scope before the shared application loads settings or photographs.
useEntryContext().value = await useRequestFetch()('/api/public/context')
</script>
<template>
  <GalleryApplication
    ><NuxtLayout><NuxtPage /></NuxtLayout
  ></GalleryApplication>
</template>
