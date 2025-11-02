<script setup lang="ts">
import { resolveComponent } from 'vue'
import type { FieldDescriptor, FieldUIType } from '~~/shared/types/settings'

interface Props {
  field: FieldDescriptor
  modelValue: any
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const getComponentName = (uiType: FieldUIType): string => {
  const componentMap: Record<FieldUIType, string> = {
    'input': 'UInput',
    'password': 'UInput',
    'url': 'UInput',
    'textarea': 'UTextarea',
    'select': 'USelectMenu',
    'radio': 'URadioGroup',
    'tabs': 'UTabs',
    'toggle': 'UToggle',
    'number': 'UInput',
    'custom': 'UInput', // 默认降级到 input
  }

  return componentMap[uiType] || 'UInput'
}

const UInput = resolveComponent('UInput')
const UTextarea = resolveComponent('UTextarea')
const USelectMenu = resolveComponent('USelectMenu')
const URadioGroup = resolveComponent('URadioGroup')
const UTabs = resolveComponent('UTabs')
const UToggle = resolveComponent('UToggle')
const UFormField = resolveComponent('UFormField')

const componentName = computed(() => {
  const name = getComponentName(props.field.ui.type)
  switch (name) {
    case 'UInput':
      return UInput
    case 'UTextarea':
      return UTextarea
    case 'USelectMenu':
      return USelectMenu
    case 'URadioGroup':
      return URadioGroup
    case 'UTabs':
      return UTabs
    case 'UToggle':
      return UToggle
    default:
      return UInput
  }
})

/**
 * Get extra props for the component
 */
const getComponentProps = (): Record<string, any> => {
  const type = props.field.ui.type
  const propsMap: Record<string, any> = {}

  if (props.field.ui.placeholder) {
    propsMap.placeholder = props.field.ui.placeholder
  }

  switch (type) {
    case 'password':
    case 'url':
    case 'number':
      propsMap.type = type
      break
    case 'select':
      propsMap.items = props.field.ui.options ? Array.from(props.field.ui.options) : []
      propsMap['label-key'] = 'label'
      propsMap['value-key'] = 'value'
      break
    case 'radio':
      propsMap.options = props.field.ui.options ? Array.from(props.field.ui.options) : []
      break
    case 'tabs':
      propsMap.items = props.field.ui.options ? Array.from(props.field.ui.options).map((opt: any) => ({
        label: $t(opt.label) || opt.label,
        value: opt.value,
        icon: opt.icon,
      })) : []
      break
    case 'textarea':
      propsMap.rows = 3
      break
  }

  return propsMap
}

const componentProps = computed(() => getComponentProps())

const handleChange = (value: any) => {
  emit('update:modelValue', value)
}

const labelKey = computed(() => {
  // 尝试从 label 字段获取翻译键
  if (props.field.label) {
    return props.field.label
  }
  // 否则构造一个默认的翻译键
  return `settings.${props.field.namespace}.${props.field.key}.label`
})

const descriptionKey = computed(() => {
  if (props.field.description) {
    return props.field.description
  }
  return `settings.${props.field.namespace}.${props.field.key}.description`
})
</script>

<template>
  <component
    :is="UFormField"
    :name="field.key"
    :label="$t(labelKey)"
    :description="$t(descriptionKey)"
    :help="field.ui.help ? $t(field.ui.help) : undefined"
    :required="field.ui.required"
  >
    <!-- 动态渲染不同的组件 -->
    <component
      :is="componentName"
      :model-value="modelValue"
      v-bind="componentProps"
      @update:model-value="handleChange"
    />
  </component>
</template>

<style scoped></style>
