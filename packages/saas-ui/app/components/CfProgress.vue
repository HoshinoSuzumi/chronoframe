<script setup lang="ts">
import { ProgressRoot, ProgressIndicator } from 'reka-ui'
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
  <ProgressRoot
    :model-value="normalized"
    :max="maximum"
    class="cf-progress"
  >
    <ProgressIndicator
      class="cf-progress-indicator"
      :style="{
        width: (normalized / maximum) * 100 + '%',
      }"
    />
  </ProgressRoot>
</template>
