<script setup lang="ts">
const props = withDefaults(defineProps<{ value?: number; max?: number }>(), {
  value: 0,
  max: 100,
})
const maximum = computed(() =>
  Number.isFinite(props.max) && props.max > 0 ? props.max : 100,
)
const normalized = computed(() =>
  Math.min(
    maximum.value,
    Math.max(0, Number.isFinite(props.value) ? props.value : 0),
  ),
)
</script>
<template>
  <div
    role="progressbar"
    :aria-valuenow="normalized"
    :aria-valuemin="0"
    :aria-valuemax="maximum"
  >
    <UProgress
      :model-value="normalized"
      :max="maximum"
      size="xs"
      color="neutral"
      aria-hidden="true"
    />
  </div>
</template>
