<script setup lang="ts">
import type { EntrySiteCatalog } from '@chronoframe/contracts/entry'
useSeoMeta({ title: 'Your sites — ChronoFrame', robots: 'noindex' })
const userId = useState<number | null>('platform-user-id', () => null)
const catalog = useState<EntrySiteCatalog | null>(
  'platform-site-catalog',
  () => null,
)
const sites = computed(() =>
  catalog.value?.userId === userId.value ? catalog.value.sites : [],
)
</script>
<template>
  <main class="cloud-message">
    <h1>Your sites</h1>
    <ul
      v-if="sites.length"
      class="space-y-4"
    >
      <li
        v-for="site in sites"
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
