<script lang="ts" setup>
import { AnimatePresence, motion } from 'motion-v'

const props = defineProps<{
  dateRange?: string
  locations?: string
  isVisible: boolean
  topOffset?: number
  class?: string
}>()

const shouldShow = computed(() => {
  return props.isVisible && !!props.dateRange
})

const dateRangeVariants = {
  initial: {
    opacity: 0,
    x: -20,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
}

// Keep a gap below the fixed header, mirroring the default top-4/top-6
// offset used when the page has no fixed header.
const DESKTOP_TOP_GAP = 16
</script>

<template>
  <div>
    <AnimatePresence>
      <motion.div
        v-if="shouldShow"
        class="fixed left-4 z-50 lg:left-6 flex flex-col gap-1 bg-black/40 backdrop-blur-3xl rounded-xl border border-white/10 px-4 py-2 pb-4 shadow-2xl"
        :class="topOffset == null ? 'top-4 lg:top-6' : ''"
        :style="
          topOffset == null
            ? undefined
            : { top: `${topOffset + DESKTOP_TOP_GAP}px` }
        "
        :initial="dateRangeVariants.initial"
        :animate="dateRangeVariants.animate"
        :exit="dateRangeVariants.initial"
        :transition="{
          type: 'spring',
          duration: 0.4,
          bounce: 0.15,
        }"
      >
        <span
          class="text-white text-2xl font-black leading-normal tracking-wide"
          >{{ dateRange }}</span
        >
        <span
          v-if="locations"
          class="text-white/80 text-xl font-bold"
          >{{ locations }}</span
        >
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped></style>
