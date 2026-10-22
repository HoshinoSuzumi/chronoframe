<script setup lang="ts">
const context = useEntryContext()
useSeoMeta({
  title: () => context.value?.name ?? 'ChronoFrame',
  robots: 'noindex',
})
</script>
<template>
  <main class="mx-auto max-w-3xl p-8"><SiteContextCard /></main>
</template>
