<script setup lang="ts">
const layout = defineModel<'list' | 'masonry'>({ required: true })
</script>
<template>
  <div
    role="group"
    :aria-label="$t('dashboard.photos.layouts.label')"
    class="flex gap-1"
  >
    <UButton
      size="sm"
      class="pointer-coarse:min-h-11"
      color="neutral"
      :variant="layout === 'masonry' ? 'outline' : 'soft'"
      icon="tabler:list"
      :aria-pressed="layout !== 'masonry'"
      @click="layout = 'list'"
      >{{ $t('dashboard.photos.layouts.list') }}</UButton
    >
    <UButton
      size="sm"
      class="pointer-coarse:min-h-11"
      color="neutral"
      :variant="layout === 'masonry' ? 'soft' : 'outline'"
      icon="tabler:layout-grid"
      :aria-pressed="layout === 'masonry'"
      @click="layout = 'masonry'"
      >{{ $t('dashboard.photos.layouts.masonry') }}</UButton
    >
  </div>
</template>
