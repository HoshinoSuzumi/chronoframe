<script setup lang="ts">
defineProps<{ light?: boolean }>()
</script>
<template>
  <NuxtLink
    to="/"
    class="cf-brand"
    :class="{ 'cf-brand-light': light }"
    aria-label="ChronoFrame home"
    ><img
      src="/web-app-manifest-192x192.png"
      width="34"
      height="34"
      class="cf-brand-logo"
      alt=""
    /><span>ChronoFrame<span class="cf-brand-dot">.</span></span></NuxtLink
  >
</template>
