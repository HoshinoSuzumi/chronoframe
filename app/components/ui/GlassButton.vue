<script lang="ts" setup>
import { motion } from 'motion-v'
import { twMerge } from 'tailwind-merge'

defineEmits<{
  (e: 'click'): void
}>()

withDefaults(
  defineProps<{
    class?: string
    size?: 'sm' | 'md' | 'lg'
    rounded?: boolean
    icon?: string
    active?: boolean
  }>(),
  {
    class: '',
    size: 'md',
    rounded: false,
    icon: '',
    active: false,
  },
)

const sizeClasses = {
  sm: 'h-9 min-w-9 text-sm',
  md: 'h-12 min-w-12 text-base',
  lg: 'h-14 min-w-14 text-lg',
}

const iconSizeClasses = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
}
</script>

<template>
  <motion.button
    :initial="{ scale: 0.5, opacity: 0 }"
    :animate="{ scale: 1, opacity: 1 }"
    :while-hover="{ scale: 1.1 }"
    :while-press="{ scale: 0.95 }"
    :transition="{ type: 'spring', stiffness: 300, damping: 20 }"
    type="button"
    :class="
      twMerge(
        'px-2 cursor-pointer pointer-events-auto font-medium flex items-center justify-center gap-1.5 bg-white/30 text-neutral-700 backdrop-blur-md border border-neutral-100 shadow-md shadow-neutral-300/20 dark:bg-neutral-700/30 dark:text-white/80 dark:border-white/10 dark:shadow-black/20 overflow-hidden',
        $props.active
          ? 'bg-primary/25 text-primary-700 border-primary/60 shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_18px_rgba(59,130,246,0.35)] dark:bg-primary/30 dark:text-primary-200 dark:border-primary/50 dark:shadow-[0_0_0_1px_rgba(96,165,250,0.3),0_0_20px_rgba(59,130,246,0.4)]'
          : '',
        sizeClasses[$props.size!],
        $props.rounded ? 'rounded-full' : 'rounded-xl',
        $props.class,
      )
    "
    @click="$emit('click')"
  >
    <Icon
      v-if="icon"
      :name="icon"
      :class="
        twMerge('inline-block shrink-0 -mt-0.5', iconSizeClasses[$props.size!])
      "
    />
    <slot />
  </motion.button>
</template>

<style scoped></style>
