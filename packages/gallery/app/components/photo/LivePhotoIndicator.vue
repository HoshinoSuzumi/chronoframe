<script lang="ts" setup>
import { motion } from 'motion-v'

defineProps<{
  photo: Photo
  isVideoPlaying: boolean
  processingState?: {
    isProcessing: boolean
    progress: number
  } | null
}>()
</script>

<template>
  <motion.div
    v-if="photo.isLivePhoto"
    class="backdrop-blur-md rounded-full pl-1 pr-1.5 py-1 text-[13px] font-bold flex items-center gap-0.5 leading-0 select-none transition-colors duration-300"
    :class="`${isVideoPlaying ? 'text-yellow-300 bg-yellow-300/10' : 'text-white bg-black/30'}`"
    :animate="{
      scale: isVideoPlaying ? 1.06 : 1,
    }"
    :transition="{
      duration: 0.3,
      ease: 'easeInOut',
    }"
  >
    <Icon
      v-if="processingState?.isProcessing"
      name="tabler:loader"
      class="size-[17px] animate-spin"
    />
    <Icon
      v-else
      name="tabler:live-photo"
      class="size-[17px]"
    />
    <span>{{ $t('ui.livePhoto') }}</span>

    <span
      v-if="processingState?.isProcessing"
      class="text-[12px] text-white/80 pl-1"
    >
      {{ Math.round(processingState.progress || 0) }}%
    </span>
  </motion.div>
</template>

<style scoped></style>
