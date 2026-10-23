<script setup lang="ts">
import type { Photo } from '@chronoframe/contracts/resources'
const context = useEntryContext()
useSeoMeta({
  title: () => context.value?.name ?? 'ChronoFrame',
  robots: 'noindex',
})
const { data, error } = await useFetch<{ photos: Photo[] }>(
  '/api/public/photos',
  { key: `public-photos-${context.value?.scope}` },
)
</script>
<template>
  <section>
    <h1>Your photographs. Your perspective.</h1>
    <p
      v-if="error"
      role="alert"
    >
      Photographs could not be loaded.
    </p>
    <GalleryGrid
      v-else-if="data?.photos.length"
      :photos="data.photos"
    />
    <p v-else>No public photographs yet.</p>
  </section>
</template>
