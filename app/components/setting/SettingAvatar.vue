<script setup lang="ts">
import { settingsFieldCommitKey } from '~/composables/useSettingsForm'
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_INPUT_BYTES,
} from '~~/shared/utils/avatar'

interface Props {
  modelValue?: string | null
  fieldKey?: string
  placeholder?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const toast = useToast()
const settingsStore = useSettingsStore()
const commitField = inject(settingsFieldCommitKey, undefined)

const ACCEPT = AVATAR_ALLOWED_MIME_TYPES.join(',')

const uploading = ref(false)
const removing = ref(false)
const previewError = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const previewSrc = computed(() =>
  typeof props.modelValue === 'string' ? props.modelValue.trim() : '',
)

const showPreview = computed(() => !!previewSrc.value && !previewError.value)

watch(
  () => props.modelValue,
  () => {
    previewError.value = false
  },
)

const urlValue = computed({
  get: () => (typeof props.modelValue === 'string' ? props.modelValue : ''),
  set: (value: string) => emit('update:modelValue', value),
})

const openFilePicker = () => fileInput.value?.click()

const showError = (title: string, err?: unknown) => {
  const data = (err as { data?: Record<string, string> })?.data
  toast.add({
    title,
    description: data?.message || data?.title || (err as Error)?.message,
    color: 'error',
  })
}

const syncAfterSave = async (value: string) => {
  emit('update:modelValue', value)
  if (props.fieldKey) {
    commitField?.(props.fieldKey, value)
  }
  await settingsStore.refreshSettings()
}

const onFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (
    file.type &&
    !(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
    showError(t('settings.app.avatarUrl.invalidType'))
    return
  }

  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    showError(
      t('settings.app.avatarUrl.tooLarge', {
        size: AVATAR_MAX_INPUT_BYTES / 1024 / 1024,
      }),
    )
    return
  }

  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const { url } = await $fetch<{ url: string }>(
      '/api/system/settings/avatar',
      { method: 'POST', body: form },
    )
    await syncAfterSave(url)
    toast.add({
      title: t('settings.app.avatarUrl.uploadSuccess'),
      color: 'success',
    })
  } catch (err) {
    showError(t('settings.app.avatarUrl.uploadFailed'), err)
  } finally {
    uploading.value = false
  }
}

const removeAvatar = async () => {
  removing.value = true
  try {
    await $fetch('/api/system/settings/avatar', { method: 'DELETE' })
    await syncAfterSave('')
    toast.add({
      title: t('settings.app.avatarUrl.removeSuccess'),
      color: 'success',
    })
  } catch (err) {
    showError(t('settings.app.avatarUrl.removeFailed'), err)
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-3">
    <div class="flex items-center gap-4">
      <div
        class="size-16 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <img
          v-if="showPreview"
          :src="previewSrc"
          class="size-full object-cover"
          :alt="t('ui.photo.avatarAlt')"
          @error="previewError = true"
        />
        <div
          v-else
          class="flex size-full items-center justify-center text-neutral-400"
        >
          <UIcon
            name="tabler:user"
            class="size-7"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="tabler:upload"
          :loading="uploading"
          @click="openFilePicker"
        >
          {{
            previewSrc
              ? t('settings.app.avatarUrl.replace')
              : t('settings.app.avatarUrl.upload')
          }}
        </UButton>
        <UButton
          v-if="previewSrc"
          color="error"
          variant="soft"
          icon="tabler:trash"
          :loading="removing"
          @click="removeAvatar"
        >
          {{ t('settings.app.avatarUrl.remove') }}
        </UButton>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          :accept="ACCEPT"
          @change="onFileChange"
        />
      </div>
    </div>

    <UInput
      v-model="urlValue"
      type="url"
      icon="tabler:link"
      class="w-full"
      :placeholder="placeholder"
    />
  </div>
</template>
