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

/**
 * 根据 UI 类型决定使用哪个组件
 * 需要与 Nuxt UI 的组件名称一致
 */
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
 * 获取组件的额外 props
 */
const getComponentProps = (): Record<string, any> => {
  const type = props.field.ui.type
  const propsMap: Record<string, any> = {}

  // 基础属性
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
        label: opt.label,
        value: opt.value,
      })) : []
      break
    case 'textarea':
      propsMap.rows = 3
      break
  }

  return propsMap
}

const componentProps = computed(() => getComponentProps())

/**
 * 处理值的变化
 */
const handleChange = (value: any) => {
  emit('update:modelValue', value)
}

/**
 * 获取 label 翻译
 */
const labelKey = computed(() => {
  // 尝试从 label 字段获取翻译键
  if (props.field.label) {
    return props.field.label
  }
  // 否则构造一个默认的翻译键
  return `settings.${props.field.namespace}.${props.field.key}.label`
})

/**
 * 获取 description 翻译
 */
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
