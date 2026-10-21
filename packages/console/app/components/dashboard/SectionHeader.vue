<script setup lang="ts">
defineProps<{
  title: string
  icon: string
}>()
</script>

<template>
  <div class="flex min-h-8 flex-wrap items-center justify-between gap-3">
    <h2 class="flex items-center gap-2.5 text-base font-semibold leading-6">
      <UIcon
        :name="icon"
        class="size-5 shrink-0 -translate-y-px text-muted"
      />
      {{ title }}
    </h2>
    <slot />
  </div>
</template>
