<script lang="ts" setup>
const { currentSortLabel, availableSorts, setSortOption } = usePhotoSort()
</script>

<template>
  <UCard
    variant="glassmorphism"
    class="w-3xs"
  >
    <template #header>
      <h3 class="font-bold text-sm p-1">
        {{ $t('ui.action.sort.title') }}
      </h3>
    </template>

    <div class="space-y-1">
      <UButton
        v-for="sort in availableSorts"
        :key="sort.key"
        :variant="currentSortLabel === sort.labelI18n ? 'soft' : 'ghost'"
        :color="currentSortLabel === sort.labelI18n ? 'info' : 'neutral'"
        :icon="sort.icon"
        size="sm"
        block
        class="justify-start"
        @click="setSortOption(sort.key)"
      >
        {{ $t(sort.labelI18n) }}
      </UButton>
    </div>
  </UCard>
</template>

<style scoped></style>
