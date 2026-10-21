<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    variant: 'embedded' | 'fixed'
    compact?: boolean
    total?: number
    dateRangeText: string
  }>(),
  { compact: false },
)

const { t } = useI18n()
const photoSummary = computed(() =>
  props.total
    ? t('ui.stats.totalPhotosWithRange', {
        range: props.dateRangeText,
        count: props.total,
      })
    : t('ui.stats.noPhotosTip'),
)
const isFixed = computed(() => props.variant === 'fixed')
</script>

<template>
  <div
    :class="
      compact
        ? ''
        : isFixed
          ? 'hidden min-w-0 flex-1 flex-col justify-center border-l border-neutral-200 pl-5 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-300 lg:flex'
          : 'space-y-1 text-center text-neutral-600 dark:text-white/30'
    "
  >
    <p
      :class="
        isFixed
          ? compact
            ? 'font-medium'
            : 'truncate font-medium'
          : 'text-xs font-medium'
      "
      :title="isFixed && !compact ? photoSummary : undefined"
    >
      {{ photoSummary }}
    </p>
    <p
      v-if="getSetting('app:slogan')"
      :class="
        isFixed
          ? compact
            ? 'mt-1'
            : 'truncate font-[Pacifico] text-sm text-neutral-500 dark:text-neutral-400'
          : 'font-[Pacifico]'
      "
    >
      {{ getSetting('app:slogan') }}
    </p>
  </div>
</template>
