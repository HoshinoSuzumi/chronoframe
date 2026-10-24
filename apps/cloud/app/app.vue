<script setup lang="ts">
useHead({ bodyAttrs: { class: 'cf-cloud-body' } })
</script>
<template>
  <UApp class="cf-root">
    <a
      href="#main-content"
      class="cf-skip-link"
      >Skip to content</a
    ><NuxtLoadingIndicator color="var(--cf-primary)" /><NuxtLayout
      ><NuxtPage
    /></NuxtLayout>
  </UApp>
</template>
