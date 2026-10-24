<script setup lang="ts">
definePageMeta({ layout: 'portal' })
const context = useEntryContext()
const site = context.value
if (!site || site.audience !== 'portal') throw createError({ statusCode: 404 })
</script>
<template>
  <CloudSiteWorkspace
    :key="site.scope"
    :site-id="site.siteId"
    :role="site.role"
    ><NuxtPage
  /></CloudSiteWorkspace>
</template>
