<script setup lang="ts">
defineProps<{ feature: { type: string; value?: string | number } }>()
const { t, locale } = useI18n()
</script>
<template>
  <UIcon
    v-if="['supported', 'unsupported', 'dash'].includes(feature.type)"
    :name="
      {
        supported: 'i-lucide-check',
        unsupported: 'i-lucide-x',
        dash: 'i-lucide-minus',
      }[feature.type]
    "
    :aria-label="
      feature.type === 'dash'
        ? '—'
        : t('cloud.billing.' + (feature.type === 'supported' ? 'yes' : 'no'))
    "
    role="img"
  />
  <span v-else>{{
    feature.type === 'number'
      ? new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(
          Number(feature.value),
        )
      : feature.value
  }}</span>
</template>
