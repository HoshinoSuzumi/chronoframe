<script lang="ts" setup>
import { motion } from 'motion-v'
import { twMerge } from 'tailwind-merge'

defineEmits<{
  (e: 'click'): void
}>()

withDefaults(
  defineProps<{
    class?: string
  }>(),
  {
    class: '',
  },
)
</script>

<template>
  <motion.button
    :initial="{ scale: 1 }"
    :while-hover="{ scale: 1.1 }"
    :while-press="{ scale: 0.95 }"
    :transition="{ type: 'spring', stiffness: 300, damping: 20 }"
    type="button"
    :class="
      twMerge(
        'pointer-events-auto flex size-10 items-center justify-center rounded-xl bg-white/80 text-neutral-700 backdrop-blur-md border border-neutral-100 shadow-lg shadow-neutral-300/25 dark:bg-black/20 dark:text-white dark:border-white/10 dark:shadow-black/25 overflow-hidden',
        $props.class,
      )
    "
    @click="$emit('click')"
  >
    <slot />
  </motion.button>
</template>

<style scoped></style>
