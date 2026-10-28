<script setup lang="ts">
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>
<template>
  <header class="cf-page-heading cf-dashboard-heading">
    <div class="min-w-0">
      <p
        v-if="eyebrow"
        class="cf-eyebrow"
      >
        {{ eyebrow }}
      </p>
      <h1 class="cf-page-title">{{ title }}</h1>
      <p
        v-if="description"
        class="cf-page-description"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.default"
      class="flex flex-wrap items-center gap-2"
    >
      <slot />
    </div>
  </header>
</template>
