<script setup lang="ts">
import { computed, normalizeClass, useSlots, type VNode } from 'vue'
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{ value?: string | number | boolean | null }>(),
  { value: undefined },
)
const model = defineModel<string | number | boolean | null>()
const emit = defineEmits<{
  change: [
    event: { target: { value: string }; currentTarget: { value: string } },
  ]
}>()
const slots = useSlots()
type Option = {
  id: string
  label: string
  raw: string | number | boolean | null
  disabled: boolean
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (value && typeof value === 'object' && 'children' in value)
    return text((value as VNode).children)
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''
}
function options(nodes: VNode[], output: Option[] = []): Option[] {
  for (const node of nodes) {
    if (node.type === 'option')
      output.push({
        id: `option-${output.length}`,
        label: text(node.children).trim(),
        raw:
          node.props && Object.hasOwn(node.props, 'value')
            ? node.props.value
            : text(node.children).trim(),
        disabled: node.props?.disabled === '' || !!node.props?.disabled,
      })
    else if (Array.isArray(node.children))
      options(node.children as VNode[], output)
  }
  return output
}
const items = computed(() => options(slots.default?.() ?? []))
const selected = computed(() => {
  const value = props.value !== undefined ? props.value : model.value
  return items.value.find((item) => item.raw === value)?.id
})
function update(id: string) {
  const item = items.value.find((option) => option.id === id)
  if (!item || item.disabled) return
  if (props.value === undefined) model.value = item.raw
  const target = { value: String(item.raw ?? '') }
  emit('change', { target, currentTarget: target })
}
</script>
<template>
  <USelect
    v-bind="{ ...$attrs, class: undefined }"
    :items="items"
    value-key="id"
    :model-value="selected"
    :class="[
      'cf-select',
      normalizeClass($attrs.class)
        .split(' ')
        .filter((name) => name !== 'cf-input'),
    ]"
    @update:model-value="update"
  />
</template>
