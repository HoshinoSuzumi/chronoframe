<script lang="ts" setup>
import type { FormSubmitEvent, FormErrorEvent } from '@nuxt/ui'

interface FieldConfig {
  hidden?: boolean
  disabled?: boolean
  placeholder?: string
  label?: string
  description?: string
  inputProps?: Record<string, any>
  checkboxProps?: Record<string, any>
  selectProps?: Record<string, any>
}

interface FieldMetadata {
  key: string
  name: string
  fieldType: 'text' | 'number' | 'checkbox' | 'select' | 'hidden'
  inputType: string
  isOptional: boolean
  label: string
  description?: string
  config?: FieldConfig
}

interface Props {
  id?: string
  schema?: any
  state?: Record<string, any>
  validate?: (state: any) => any[] | Promise<any[]>
  validateOn?: any[]
  disabled?: boolean
  validateOnInputDelay?: number
  transform?: boolean
  nested?: boolean
  loadingAuto?: boolean
  class?: string
  fieldsConfig?: Record<string, FieldConfig>
}

const props = withDefaults(defineProps<Props>(), {
  id: undefined,
  schema: undefined,
  state: undefined,
  validate: undefined,
  validateOn: undefined,
  disabled: undefined,
  validateOnInputDelay: undefined,
  transform: true,
  nested: undefined,
  loadingAuto: true,
  class: undefined,
  fieldsConfig: undefined,
})

const emit = defineEmits<{
  submit: [event: FormSubmitEvent<any>]
  error: [event: FormErrorEvent]
}>()

const form = useTemplateRef('form')

// 从 Zod schema 提取字段元数据
const fields = computed<FieldMetadata[]>(() => {
  if (!props.schema || !props.schema._def) return []

  let shape: Record<string, any> = {}

  // 处理 discriminatedUnion 类型
  if (props.schema._def.discriminatedUnion) {
    // 获取判别键名和当前值
    const discriminatorKey = props.schema._def.discriminator
    const discriminatorValue = props.state?.[discriminatorKey]

    // 从 options 中找到匹配的 schema
    const matchedSchema = props.schema._def.optionsMap?.get(discriminatorValue)

    if (matchedSchema) {
      const optShape = matchedSchema._def.shape?.()
      shape = optShape || {}

      // 调试：检查获取到的 shape
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[AutoForm] discriminatedUnion shape keys:',
          Object.keys(shape),
        )
        Object.entries(shape).forEach(([k, v]: any) => {
          console.log(
            `  ${k}: type=${v._def?.type}, typeName=${v._def?.typeName}`,
          )
        })
      }
    }
  }
  // 处理普通 ZodObject
  else if (typeof props.schema._def.shape === 'function') {
    shape = props.schema._def.shape()
  } else if (props.schema._def.shape) {
    shape = props.schema._def.shape
  } else {
    return []
  }

  return Object.entries(shape).map(([key, value]: any) => {
    // value 是 ZodSchema 实例
    // 在 Zod v4 中，_def.type 用于标识类型，_def.typeName 在 v3 中使用
    const type = value._def?.type
    const typeName = value._def?.typeName

    // 检查是否为可选：Zod v4 使用 type: 'optional'
    const isOptional = type === 'optional' || typeName === 'ZodOptional'

    // 获取实际类型的 _def（如果是 optional，从 innerType 获取）
    const actualTypeDef = isOptional ? value._def.innerType._def : value._def

    // 确定字段类型
    let fieldType: 'text' | 'number' | 'checkbox' | 'select' | 'hidden' = 'text'
    let inputType = 'text'

    // 在 Zod v4 中使用 type 而不是 typeName
    const actualType = actualTypeDef.type || actualTypeDef.typeName

    switch (actualType) {
      case 'boolean':
      case 'ZodBoolean': {
        fieldType = 'checkbox'
        break
      }
      case 'number':
      case 'ZodNumber': {
        fieldType = 'number'
        inputType = 'number'
        break
      }
      case 'enum':
      case 'ZodEnum': {
        fieldType = 'select'
        break
      }
      case 'string':
      case 'ZodString': {
        // 检查是否有特殊的字符串验证（如 email, url）
        const checks = actualTypeDef.checks || []
        const emailCheck = checks.find((c: any) => c.kind === 'email')
        const urlCheck = checks.find((c: any) => c.kind === 'url')

        if (emailCheck) {
          inputType = 'email'
        } else if (urlCheck) {
          inputType = 'url'
        }
        break
      }
    }

    // 生成 label（将 camelCase 转换为 Title Case）
    const defaultLabel = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str: string) => str.toUpperCase())
      .trim()

    // 应用 fieldsConfig 中的配置
    const config = props.fieldsConfig?.[key] || {}

    // 使用 config 中的 label 和 description，如果没有则使用默认值
    const label = config.label ?? defaultLabel
    const description = config.description

    return {
      key,
      name: key,
      fieldType,
      inputType,
      isOptional,
      label,
      description,
      config,
    }
  })
})

const handleSubmit = (event: FormSubmitEvent<any>) => {
  emit('submit', event)
}

const handleError = (event: FormErrorEvent) => {
  emit('error', event)
}

defineExpose({
  submit: () => form.value?.submit(),
  validate: (opts?: any) => form.value?.validate(opts),
  clear: (path?: any) => form.value?.clear(path),
  getErrors: (path?: any) => form.value?.getErrors(path),
  setErrors: (errors: any[], name?: any) => form.value?.setErrors(errors, name),
  get errors() {
    return form.value?.errors
  },
  get disabled() {
    return form.value?.disabled
  },
  get dirty() {
    return form.value?.dirty
  },
  get dirtyFields() {
    return form.value?.dirtyFields
  },
  get touchedFields() {
    return form.value?.touchedFields
  },
  get blurredFields() {
    return form.value?.blurredFields
  },
})
</script>

<template>
  <UForm
    :id="id"
    ref="form"
    :schema="schema"
    :state="state"
    :validate="validate"
    :validate-on="validateOn"
    :disabled="disabled"
    :validate-on-input-delay="validateOnInputDelay"
    :transform="transform"
    :nested="nested"
    :loading-auto="loadingAuto"
    @submit="handleSubmit"
    @error="handleError"
  >
    <div class="space-y-4">
      <template
        v-for="field of fields"
        :key="field.key"
      >
        <UFormField
          v-if="field.fieldType !== 'hidden' && !field.config?.hidden"
          :label="field.label"
          :name="field.name"
          :required="!field.isOptional"
          :description="field.description"
          :ui="{
            container: 'sm:max-w-full',
          }"
        >
          <!-- Text Input -->
          <UInput
            v-if="field.fieldType === 'text'"
            v-model="state![field.key]"
            :type="field.inputType"
            :placeholder="
              field.config?.placeholder ?? `${field.label.toLowerCase()}`
            "
            :disabled="field.config?.disabled ?? false"
            class="w-full"
            v-bind="field.config?.inputProps ?? {}"
          />

          <!-- Number Input -->
          <UInput
            v-if="field.fieldType === 'number'"
            v-model.number="state![field.key]"
            type="number"
            :placeholder="
              field.config?.placeholder ?? `${field.label.toLowerCase()}`
            "
            :disabled="field.config?.disabled ?? false"
            class="w-full"
            v-bind="field.config?.inputProps ?? {}"
          />

          <!-- Checkbox -->
          <UCheckbox
            v-if="field.fieldType === 'checkbox'"
            v-model="state![field.key]"
            :label="field.label"
            :disabled="field.config?.disabled ?? false"
            v-bind="field.config?.checkboxProps ?? {}"
          />

          <!-- Select -->
          <USelect
            v-if="field.fieldType === 'select'"
            v-model="state![field.key]"
            :items="[]"
            :disabled="field.config?.disabled ?? false"
            class="w-full"
            v-bind="field.config?.selectProps ?? {}"
          />
        </UFormField>
      </template>
    </div>

    <slot />
  </UForm>
</template>

<style scoped></style>
