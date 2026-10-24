<script setup lang="ts">
import type { Album } from '@chronoframe/contracts/resources'
const context = useEntryContext()
const { data, error } = await useFetch<{ albums: Album[] }>(
  '/api/public/albums',
  { key: `public-albums-${context.value?.scope}` },
)
useSeoMeta({
  title: () => `Albums — ${context.value?.name ?? 'ChronoFrame'}`,
  robots: 'noindex',
})
</script>
<template>
  <section>
    <h1>Albums</h1>
    <p
      v-if="error"
      role="alert"
    >
      Albums could not be loaded.
    </p>
    <div
      v-else
      class="site-album-list"
    >
      <NuxtLink
        v-for="album in data?.albums"
        :key="album.id"
        :to="'/albums/' + album.id"
        ><h2>{{ album.title }}</h2>
        <p v-if="album.hasPassword">Password protected</p></NuxtLink
      >
    </div>
  </section>
</template>
