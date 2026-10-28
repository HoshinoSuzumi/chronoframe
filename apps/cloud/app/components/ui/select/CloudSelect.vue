<script setup lang="ts">
const props = defineProps<{ value?: string | number | boolean | null }>()
const model = defineModel<string | number | boolean | null>()
// Preserve native controlled-value forms as well as v-model consumers.
const selected = computed({
  get: () => (props.value !== undefined ? props.value : model.value),
  set: (value) => {
    if (props.value === undefined) model.value = value
  },
})
</script>
<template>
  <select
    v-model="selected"
    class="cf-input cf-select"
  >
    <slot />
  </select>
</template>
