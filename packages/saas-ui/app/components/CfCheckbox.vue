<script setup lang="ts">
import { normalizeClass } from 'vue'
defineOptions({ inheritAttrs: false })
// Compatibility for existing array-valued fields and native change handlers.
const props = withDefaults(
  defineProps<{ checked?: boolean; value?: string | number }>(),
  { checked: undefined, value: undefined },
)
const model = defineModel<boolean | (string | number)[]>()
const emit = defineEmits<{ change: [event: Event] }>()
const checkedValue = computed(() =>
  props.checked !== undefined
    ? props.checked
    : Array.isArray(model.value)
      ? model.value.includes(props.value!)
      : !!model.value,
)
function update(value: boolean | 'indeterminate') {
  const checked = value === true
  if (Array.isArray(model.value))
    model.value = checked
      ? [...new Set([...model.value, props.value!])]
      : model.value.filter((item) => item !== props.value)
  else model.value = checked
  const event = new Event('change', { bubbles: true })
  Object.defineProperty(event, 'target', {
    value: { checked, value: props.value },
  })
  emit('change', event)
}
</script>
<template>
  <UCheckbox
    v-bind="{
      ...$attrs,
      class: normalizeClass($attrs.class)
        .split(/\s+/)
        .filter((name) => name !== 'cf-input'),
    }"
    :model-value="checkedValue"
    @update:model-value="update"
  />
</template>
