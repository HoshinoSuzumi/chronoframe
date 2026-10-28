<script setup lang="ts">
import { RadioGroupRoot, RadioGroupItem } from 'reka-ui'
defineProps<{
  options: { value: string; label: string; disabled?: boolean }[]
  label: string
}>()
const model = defineModel<string>()
</script>
<template>
  <RadioGroupRoot
    v-model="model"
    class="cf-segmented-control"
    :aria-label="label"
    ><RadioGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
      class="cf-segmented-item"
      >{{ option.label }}</RadioGroupItem
    ></RadioGroupRoot
  >
</template>
