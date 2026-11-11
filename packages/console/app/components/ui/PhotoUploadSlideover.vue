<script setup lang="ts">
withDefaults(
  defineProps<{
    maxFileSizeMB: number
    disabled?: boolean
    loading?: boolean
    canUpload?: boolean
    accept?: string
  }>(),
  {
    canUpload: true,
    accept: 'image/jpeg,image/png,image/heic,image/heif,video/quicktime,.mov',
  },
)
const open = defineModel<boolean>('open', { required: true })
const files = defineModel<File[]>('files', { required: true })
const emit = defineEmits<{ upload: [] }>()
const summary = computed(() =>
  files.value.length
    ? $t('dashboard.photos.slideover.footer.prepared', {
        count: files.value.length,
        size: formatBytes(
          files.value.reduce((sum, file) => sum + file.size, 0),
        ),
      })
    : $t('dashboard.photos.slideover.footer.noSelection'),
)
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="$t('dashboard.photos.slideover.title')"
    :description="$t('dashboard.photos.slideover.description')"
    :ui="{
      content: 'sm:max-w-xl',
      body: 'p-2',
      header: 'px-6 py-5 border-b border-neutral-200 dark:border-neutral-800',
      footer: 'px-6 py-5 border-t border-neutral-200 dark:border-neutral-800',
    }"
  >
    <template #body>
      <div class="space-y-4">
        <slot name="before-files" />
        <UFileUpload
          v-model="files"
          :label="$t('dashboard.photos.uploader.label')"
          :description="
            $t('dashboard.photos.uploader.description', {
              maxSize: maxFileSizeMB,
            })
          "
          icon="tabler:cloud-upload"
          layout="list"
          size="xl"
          :accept="accept"
          :disabled="disabled"
          multiple
          highlight
          dropzone
          :file-delete="{ variant: 'soft', color: 'neutral' }"
          :ui="{
            root: 'w-full',
            base: 'group relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-neutral-200/80 bg-white/90 px-6 py-12 text-center shadow-sm transition-all duration-300 hover:border-primary-400/80 hover:bg-primary-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 dark:border-neutral-700/70 dark:bg-neutral-900/80',
            wrapper: 'flex flex-col items-center gap-2',
            label:
              'text-base font-semibold text-neutral-800 dark:text-neutral-100',
            description: 'text-sm text-neutral-500 dark:text-neutral-400',
            files: 'mt-2 flex w-full flex-col gap-2 overflow-y-auto',
            file: 'flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white/80 px-4 py-3 text-left shadow-sm shadow-black/5 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-900/70',
            fileLeadingAvatar: 'ring-1 ring-white/80 dark:ring-neutral-800',
            fileWrapper: 'min-w-0 flex-1',
            fileName:
              'text-sm font-medium text-neutral-700 dark:text-neutral-100 truncate',
            fileSize: 'text-xs text-neutral-500 dark:text-neutral-400',
            fileTrailingButton: 'text-neutral-400 hover:text-error-500',
          }"
        />
        <slot />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-col gap-4">
        <div
          v-if="$slots.options"
          class="flex w-full flex-col gap-4"
        >
          <slot name="options" />
        </div>
        <div
          class="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div
            class="flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400"
          >
            <span>{{ summary }}</span>
          </div>
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <UButton
              variant="soft"
              color="neutral"
              class="w-full sm:w-auto"
              :disabled="disabled || !files.length"
              @click="files = []"
            >
              {{ $t('dashboard.photos.slideover.buttons.clear') }}
            </UButton>
            <UButton
              color="primary"
              size="lg"
              class="w-full sm:w-auto"
              icon="tabler:upload"
              :loading="loading"
              :disabled="disabled || !files.length || !canUpload"
              @click="emit('upload')"
            >
              {{
                files.length
                  ? $t('dashboard.photos.slideover.buttons.upload', {
                      count: files.length,
                    })
                  : $t('dashboard.photos.buttons.upload')
              }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
