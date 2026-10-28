<script setup lang="ts">
import { ProgressRoot, ProgressIndicator } from 'reka-ui'
withDefaults(defineProps<{ value?: number; max?: number }>(), {
  value: 0,
  max: 100,
})
</script>
<template>
  <ProgressRoot
    :model-value="value"
    :max="max"
    class="cf-progress"
  >
    <ProgressIndicator
      class="cf-progress-indicator"
      :style="{
        width:
          Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100)) + '%',
      }"
    />
  </ProgressRoot>
</template>
