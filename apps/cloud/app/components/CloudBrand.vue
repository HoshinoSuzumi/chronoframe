<script setup lang="ts">
import { Aperture } from 'lucide-vue-next'
defineProps<{ light?: boolean }>()
</script>
<template>
  <NuxtLink
    to="/"
    class="cf-brand"
    :class="{ 'cf-brand-light': light }"
    aria-label="ChronoFrame home"
    ><Aperture
      :size="25"
      :stroke-width="1.6"
      aria-hidden="true"
    /><span>ChronoFrame<span class="cf-brand-dot">.</span></span></NuxtLink
  >
</template>
