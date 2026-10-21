<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

const props = withDefaults(
  defineProps<{
    variant: 'embedded' | 'fixed'
    compact?: boolean
  }>(),
  { compact: false },
)

const isFixed = computed(() => props.variant === 'fixed')
const isRepoLinkHovering = ref(false)
const copyrightName = computed(
  () => getSetting('app:author') || getSetting('app:title'),
)
</script>

<template>
  <div
    :class="
      isFixed
        ? compact
          ? 'mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800'
          : 'hidden max-w-52 shrink-0 flex-col items-end border-l border-neutral-200 pl-5 text-[11px] leading-5 text-neutral-500 dark:border-neutral-800 lg:flex'
        : 'flex w-full items-center justify-between gap-2 bg-neutral-200/50 px-2 pb-1 pt-1.5 dark:bg-neutral-900/50'
    "
  >
    <p
      v-if="copyrightName"
      :class="
        isFixed
          ? compact
            ? ''
            : 'w-full truncate text-right'
          : 'truncate text-xs font-medium text-neutral-500/80 dark:text-neutral-500'
      "
    >
      © {{ $dayjs().format('YYYY') }} {{ copyrightName }}
    </p>
    <a
      href="https://github.com/HoshinoSuzumi/chronoframe"
      target="_blank"
      rel="noopener noreferrer"
      :class="
        isFixed
          ? compact
            ? 'inline-flex items-center gap-1 hover:underline'
            : 'inline-flex items-center gap-1 whitespace-nowrap hover:underline'
          : 'group inline-flex items-center gap-0.5 text-xs font-medium text-neutral-500/60 hover:underline dark:text-neutral-500/80'
      "
      @mouseenter="isRepoLinkHovering = true"
      @mouseleave="isRepoLinkHovering = false"
    >
      <Icon
        name="mdi:github"
        mode="svg"
        :class="isFixed ? '' : '-mt-px inline-block text-sm'"
      />
      ChronoFrame
      <template v-if="isFixed">{{ ' ' }}{{ $config.public.VERSION }}</template>
      <AnimatePresence v-else>
        <motion.span
          v-if="isRepoLinkHovering"
          :initial="{ width: 0, opacity: 0 }"
          :animate="{ width: 'auto', opacity: 1 }"
          :exit="{ width: 0, opacity: 0 }"
          :transition="{ duration: 0.3, ease: 'easeInOut' }"
          style="overflow: hidden; white-space: nowrap"
        >
          ({{ $config.public.VERSION }})
        </motion.span>
      </AnimatePresence>
    </a>
  </div>
</template>
