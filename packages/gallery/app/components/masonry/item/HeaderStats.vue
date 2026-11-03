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
          ? 'hidden min-h-8 min-w-0 flex-1 flex-col justify-center border-l border-neutral-200/80 pl-4 text-[11px] leading-4 text-neutral-600 dark:border-white/10 dark:text-neutral-300 lg:flex'
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
      v-if="!isFixed && getSetting('app:slogan')"
      class="font-[Pacifico]"
    >
      {{ getSetting('app:slogan') }}
    </p>
  </div>
</template>
