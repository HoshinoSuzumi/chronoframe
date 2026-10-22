<script setup lang="ts">
useSeoMeta({ title: 'Cloud access — ChronoFrame', robots: 'noindex' })
</script>
<template>
  <main class="cloud-message">
    <NuxtLink
      to="/"
      class="brand"
      >ChronoFrame</NuxtLink
    >
    <h1>Cloud access is coming.</h1>
    <p>
      The hosted service is not available yet. You can use ChronoFrame today by
      running the self-hosted edition.
    </p>
    <div class="actions">
      <UButton to="https://github.com/HoshinoSuzumi/chronoframe"
        >Explore Self-hosted</UButton
      ><UButton
        to="/"
        variant="ghost"
        >Back to home</UButton
      >
    </div>
  </main>
</template>
