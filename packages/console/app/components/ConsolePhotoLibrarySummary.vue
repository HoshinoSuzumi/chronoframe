<script setup lang="ts">
import type { Photo } from '@chronoframe/contracts/resources'
const props = defineProps<{ photos: Photo[] }>()
const livePhotoStats = computed(() => ({
  livePhotos: props.photos.filter((photo) => photo.isLivePhoto).length,
  staticPhotos: props.photos.filter((photo) => !photo.isLivePhoto).length,
}))
</script>
<template>
  <div class="flex items-center gap-3">
    <div
      class="flex size-8 items-center justify-center rounded-[10px] bg-neutral-200/50 dark:bg-neutral-800/50 border border-neutral-200/50 dark:border-neutral-700/50"
    >
      <UIcon
        name="tabler:photo"
        class="size-4.5 text-neutral-600 dark:text-neutral-400"
      />
    </div>
    <span
      class="font-semibold text-sm text-neutral-700 dark:text-neutral-300 hidden sm:inline"
    >
      {{ $t('dashboard.photos.toolbar.title') }}
    </span>
    <div class="flex items-center gap-1 sm:gap-2 sm:ml-1">
      <UBadge
        v-if="livePhotoStats.staticPhotos > 0"
        variant="soft"
        color="neutral"
        size="sm"
      >
        <span class="hidden sm:inline"
          >{{ livePhotoStats.staticPhotos }}
          {{ $t('dashboard.photos.stats.photos') }}</span
        >
        <span class="sm:hidden">{{ livePhotoStats.staticPhotos }}P</span>
      </UBadge>
      <UBadge
        v-if="livePhotoStats.livePhotos > 0"
        variant="soft"
        color="warning"
        size="sm"
      >
        <span class="hidden sm:inline"
          >{{ livePhotoStats.livePhotos }}
          {{ $t('dashboard.photos.stats.livePhotos') }}</span
        >
        <span class="sm:hidden">{{ livePhotoStats.livePhotos }}LP</span>
      </UBadge>
    </div>
  </div>
</template>
