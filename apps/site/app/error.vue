<script setup lang="ts">
import type { NuxtError } from '#app'
defineProps<{ error: NuxtError }>()
useHead({
  title: 'ChronoFrame',
  meta: [{ name: 'robots', content: 'noindex' }],
})
</script>
<template>
  <main class="unavailable">
    <p>ChronoFrame</p>
    <h1>
      {{ error.statusCode === 404 ? 'Page not found' : 'Service unavailable' }}
    </h1>
    <p>
      {{
        error.statusCode === 404
          ? 'This page is unavailable or the gallery has not been published.'
          : 'Please try again later.'
      }}
    </p>
  </main>
</template>
<style scoped>
.unavailable {
  max-width: 36rem;
  margin: 18vh auto;
  padding: 2rem;
  font-family: system-ui, sans-serif;
}
h1 {
  font-size: 2rem;
  margin: 1rem 0;
}
</style>
