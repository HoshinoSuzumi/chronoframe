<script lang="ts" setup>
import { AnimatePresence, motion } from 'motion-v'

const props = defineProps<{
  dateRange?: string
  locations?: string
  isVisible: boolean
  isMobile?: boolean
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

const mobileVariants = {
  initial: {
    opacity: 0,
    y: -20,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
}
</script>

<template>
  <div>
    <AnimatePresence>
      <!-- Desktop Date Range Indicator -->
      <motion.div
        v-if="shouldShow && !isMobile"
        class="fixed top-4 left-4 z-50 lg:top-6 lg:left-6 flex flex-col gap-1 bg-black/40 backdrop-blur-3xl rounded-xl border border-white/10 px-4 py-2 pb-4 shadow-2xl"
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
          class="text-white text-4xl font-black leading-normal tracking-wide"
          >{{ dateRange }}</span
        >
        <span
          v-if="locations"
          class="text-white/80 text-xl font-bold"
          >{{ locations }}</span
        >
      </motion.div>

      <!-- Mobile Date Range Indicator -->
      <motion.div
        v-if="shouldShow && isMobile"
        class="fixed inset-0 bottom-auto z-50"
        :initial="mobileVariants.initial"
        :animate="mobileVariants.animate"
        :exit="mobileVariants.initial"
        :transition="{
          type: 'spring',
          duration: 0.3,
          bounce: 0.1,
        }"
      >
        <div
          class="bg-black/60 backdrop-blur-3xl border-b border-white/10 px-4 py-2 shadow-2xl flex flex-col"
        >
          <span class="text-white text-lg font-medium">{{ dateRange }}</span>
          <span
            v-if="locations"
            class="text-white/80 text-xs"
            >{{ locations }}</span
          >
        </div>
      </motion.div>
    </AnimatePresence>
  </div>
</template>

<style scoped></style>
