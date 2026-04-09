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
    input: 'UInput',
    password: 'UInput',
    url: 'UInput',
    textarea: 'UTextarea',
    select: 'USelectMenu',
    radio: 'URadioGroup',
    tabs: 'UTabs',
    toggle: 'USwitch',
    number: 'UInput',
    custom: 'UInput', // 默认降级到 input
  }

  return componentMap[uiType] || 'UInput'
}

const UInput = resolveComponent('UInput')
const UTextarea = resolveComponent('UTextarea')
const USelectMenu = resolveComponent('USelectMenu')
const URadioGroup = resolveComponent('URadioGroup')
const UTabs = resolveComponent('UTabs')
const USwitch = resolveComponent('USwitch')
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
    case 'USwitch':
      return USwitch
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
      propsMap.items = props.field.ui.options
        ? Array.from(props.field.ui.options)
        : []
      propsMap['label-key'] = 'label'
      propsMap['value-key'] = 'value'
      break
    case 'radio':
      propsMap.options = props.field.ui.options
        ? Array.from(props.field.ui.options)
        : []
      break
    case 'tabs':
      propsMap.items = props.field.ui.options
        ? Array.from(props.field.ui.options).map((opt: any) => ({
            label: $t(opt.label) || opt.label,
            value: opt.value,
            icon: opt.icon,
          }))
        : []
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

const isToggleField = computed(() => props.field.ui.type === 'toggle')
</script>

<template>
  <div
    v-if="isToggleField"
    class="rounded-md border border-neutral-200 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/40"
  >
    <div class="flex items-start justify-between gap-6">
      <div class="space-y-1">
        <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {{ $t(labelKey) }}
        </p>
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          {{ $t(descriptionKey) }}
        </p>
        <p
          v-if="field.ui.help"
          class="text-xs text-neutral-500 dark:text-neutral-500"
        >
          {{ $t(field.ui.help) }}
        </p>
      </div>

      <component
        :is="componentName"
        :model-value="modelValue"
        v-bind="componentProps"
        @update:model-value="handleChange"
      />
    </div>
  </div>

  <component
    :is="UFormField"
    v-else
    :name="field.key"
    :label="$t(labelKey)"
    :description="$t(descriptionKey)"
    :help="field.ui.help ? $t(field.ui.help) : undefined"
    :required="field.ui.required"
    :ui="{
      container: 'w-full *:w-full',
      label: 'text-sm font-medium',
      description: 'text-sm text-neutral-600 dark:text-neutral-400',
    }"
  >
    <component
      :is="componentName"
      :model-value="modelValue"
      v-bind="componentProps"
      @update:model-value="handleChange"
    />
  </component>
</template>

<style scoped></style>
