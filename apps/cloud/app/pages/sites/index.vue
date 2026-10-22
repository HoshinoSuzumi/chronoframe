<script setup lang="ts">
useSeoMeta({ title: 'Your sites — ChronoFrame', robots: 'noindex' })
const userId = useState<number | null>('platform-user-id', () => null)
const { data, error, refresh } = await useFetch('/api/sites', {
  key: computed(() => `platform-sites:${userId.value}`),
  getCachedData: () => undefined,
  immediate: false,
  cache: 'no-store',
})
// Nuxt can retain a live AsyncData ref even when payload cache reuse is disabled.
// Always finish a fresh membership query before rendering the catalog.
await refresh({ dedupe: 'cancel' })
if (error.value)
  throw createError({
    statusCode: error.value.statusCode ?? 503,
    statusMessage: 'Unable to load sites',
  })
</script>
<template>
  <main class="cloud-message">
    <h1>Your sites</h1>
    <ul
      v-if="data?.sites.length"
      class="space-y-4"
    >
      <li
        v-for="site in data.sites"
        :key="site.siteId"
      >
        <NuxtLink :to="`/sites/${site.siteId}`">{{ site.name }}</NuxtLink>
        <span>
          · {{ site.role }} ·
          {{ site.published ? 'Published' : 'Not published' }}</span
        >
      </li>
    </ul>
    <p v-else>
      You have no sites yet. Workspace and site creation are coming in the next
      stage.
    </p>
    <NuxtLink to="/account">Your account</NuxtLink>
  </main>
</template>
