<script setup lang="ts">
import type { FieldDescriptor } from '~~/shared/types/settings'

interface Props {
  title: string
  description?: string
  fields: FieldDescriptor[]
  namespace: string
  state: Record<string, any>
  loading?: boolean
  submitLabel?: string
  icon?: string
  submitIcon?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  submit: [data: Record<string, any>]
}>()

const formRef = ref()
const formState = ref<Record<string, any>>({})

// 监听 props.state 的变化
watch(() => props.state, (newState) => {
  formState.value = { ...newState }
}, { immediate: true })

/**
 * 处理表单提交
 */
const handleSubmit = async (event: any) => {
  emit('submit', event.data)
}
</script>

<template>
  <UCard variant="outline">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon v-if="icon" :name="icon" size="lg" />
        <div>
          <p class="font-semibold">{{ title }}</p>
          <p v-if="description" class="text-xs text-gray-500">
            {{ description }}
          </p>
        </div>
      </div>
    </template>

    <UForm
      ref="formRef"
      :state="formState"
      class="space-y-4"
      @submit="handleSubmit"
    >
      <SettingField
        v-for="field in fields"
        :key="field.key"
        :field="field"
        :model-value="formState[field.key]"
        @update:model-value="formState[field.key] = $event"
      />
    </UForm>

    <template #footer>
      <UButton
        type="submit"
        variant="soft"
        :icon="submitIcon ?? 'tabler:device-floppy'"
        :loading="loading"
        :disabled="loading"
      >
        {{ submitLabel ?? '保存设置' }}
      </UButton>
    </template>
  </UCard>
</template>

<style scoped></style>
