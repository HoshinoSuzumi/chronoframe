<script setup lang="ts">
// Keep an omitted Boolean-union prop distinct from an explicitly controlled false.
const props = withDefaults(
  defineProps<{ value?: string | number | boolean | null }>(),
  { value: undefined },
)
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
