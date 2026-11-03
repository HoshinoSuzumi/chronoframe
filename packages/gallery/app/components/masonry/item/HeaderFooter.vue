<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'
import { siteFooterLink } from '../../../utils/site-footer-link'

const props = withDefaults(
  defineProps<{
    variant: 'embedded' | 'fixed' | 'menu'
    compact?: boolean
  }>(),
  { compact: false },
)

const isFixed = computed(() => props.variant === 'fixed')
const isMenu = computed(() => props.variant === 'menu')
const entry = useEntryContext()
const capabilities = useEntryCapabilities()
const edition = computed(
  () => entry.value?.capabilities.edition ?? capabilities.edition,
)
const showMenuVersion = computed(() => isMenu.value && edition.value !== 'site')
const websiteHref = computed(() => {
  if (props.variant === 'menu') {
    // Site editions keep the same marketing attribution as the embedded footer,
    // including the original UTM parameters.
    return edition.value === 'site'
      ? siteFooterLink('site', 'embedded', entry.value?.siteId)
      : null
  }
  return siteFooterLink(edition.value, props.variant, entry.value?.siteId)
})
const isRepoLinkHovering = ref(false)
const copyrightName = computed(
  () => getSetting('app:author') || getSetting('app:title'),
)
</script>

<template>
  <div
    :class="
      isMenu
        ? 'flex w-full items-center justify-end px-1 pt-2'
        : isFixed
          ? compact
            ? 'mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800'
            : 'hidden max-w-52 shrink-0 flex-col items-end border-l border-neutral-200 pl-5 text-[11px] leading-5 text-neutral-500 dark:border-neutral-800 lg:flex'
          : 'flex w-full items-center justify-between gap-2 bg-neutral-200/50 px-2 pb-1 pt-1.5 dark:bg-neutral-900/50'
    "
  >
    <p
      v-if="copyrightName && !isMenu"
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
      :href="websiteHref || 'https://github.com/HoshinoSuzumi/chronoframe'"
      target="_blank"
      rel="noopener noreferrer"
      :class="
        isFixed
          ? compact
            ? 'inline-flex items-center gap-1 hover:underline'
            : 'inline-flex items-center gap-1 whitespace-nowrap hover:underline'
          : isMenu
            ? 'group inline-flex items-center gap-0.5 text-xs font-medium text-neutral-500 hover:underline dark:text-neutral-400'
            : 'group inline-flex items-center gap-0.5 text-xs font-medium text-neutral-500/60 hover:underline dark:text-neutral-500/80'
      "
      @mouseenter="isRepoLinkHovering = !websiteHref"
      @mouseleave="isRepoLinkHovering = false"
    >
      <Icon
        :name="websiteHref ? 'tabler:external-link' : 'mdi:github'"
        mode="svg"
        :class="isFixed ? '' : '-mt-px inline-block text-sm'"
      />
      ChronoFrame
      <template v-if="isFixed || showMenuVersion"
        >{{ ' ' }}{{ $config.public.VERSION }}</template
      >
      <AnimatePresence v-else-if="!websiteHref">
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
