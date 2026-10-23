<script setup lang="ts">
import type { NuxtError } from '#app'
import { ArrowLeft, RotateCw } from 'lucide-vue-next'
const props = defineProps<{ error: NuxtError }>()
useHead({
  title: 'ChronoFrame',
  meta: [{ name: 'robots', content: 'noindex' }],
})
const notFound = computed(() => props.error.statusCode === 404)
</script>
<template>
  <main
    id="main-content"
    class="cf-error"
  >
    <CloudBrand />
    <p class="cf-error-code">{{ error.statusCode }}</p>
    <h1>
      {{ notFound ? 'A frame we couldn’t find.' : 'A moment out of focus.' }}
    </h1>
    <p>
      {{
        notFound
          ? 'This page may have moved, or you may not have access to it.'
          : 'We couldn’t load this page. Please try again in a moment.'
      }}
    </p>
    <div class="cf-header-actions">
      <CloudButton
        variant="secondary"
        as-child
        ><a href="https://chronoframe.art/"
          ><ArrowLeft :size="15" />Back to home</a
        ></CloudButton
      ><CloudButton
        v-if="!notFound"
        @click="reloadNuxtApp({ force: true })"
        ><RotateCw :size="15" />Try again</CloudButton
      >
    </div>
  </main>
</template>
