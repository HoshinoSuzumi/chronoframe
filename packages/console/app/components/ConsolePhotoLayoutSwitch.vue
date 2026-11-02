<script setup lang="ts">
const layout = defineModel<'list' | 'masonry'>({ required: true })
const { t } = useI18n()
const targetLabel = computed(() =>
  t(
    `dashboard.photos.layouts.${layout.value === 'masonry' ? 'list' : 'masonry'}`,
  ),
)
</script>
<template>
  <UButton
    size="sm"
    class="cf-photo-layout-switch h-7 min-h-7! w-7 min-w-7!"
    color="neutral"
    variant="soft"
    square
    :icon="layout === 'masonry' ? 'tabler:list' : 'tabler:layout-grid'"
    :aria-label="targetLabel"
    :title="targetLabel"
    @click="layout = layout === 'masonry' ? 'list' : 'masonry'"
  />
</template>
