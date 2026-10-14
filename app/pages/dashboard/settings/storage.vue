<script lang="ts" setup>
import { z } from 'zod'
import type { StorageConfig } from '~~/shared/types/storage'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.storageSettings'),
})

const toast = useToast()
const { t } = useI18n()

const {
  data: currentStorageProvider,
  refresh: refreshCurrentStorageProvider,
  status: currentStorageStatus,
} = await useFetch<{
  namespace: string
  key: string
  value: SettingValue
}>('/api/system/settings/storage/provider')

const {
  data: availableStorage,
  refresh: refreshAvailableStorage,
  status: availableStorageStatus,
} = await useFetch<SettingStorageProvider[]>(
  '/api/system/settings/storage-config',
)

const PROVIDER_ICON = {
  s3: 'tabler:brand-aws',
  local: 'tabler:database',
  openlist: 'tabler:cloud',
}

const activeStorage = computed(() =>
  availableStorage.value?.find(
    (storage) => storage.id === currentStorageProvider.value?.value,
  ),
)
const sortedStorage = computed(() =>
  [...(availableStorage.value || [])].sort(
    (a, b) =>
      Number(b.id === activeStorage.value?.id) -
      Number(a.id === activeStorage.value?.id),
  ),
)
const storagePendingActivation = ref<SettingStorageProvider | null>(null)
const isSwitchConfirmOpen = ref(false)
const isSwitchingStorage = ref(false)

const requestStorageActivation = (storage: SettingStorageProvider) => {
  if (isSwitchingStorage.value || storage.id === activeStorage.value?.id) return
  storagePendingActivation.value = storage
  isSwitchConfirmOpen.value = true
}

const confirmStorageActivation = async () => {
  if (!storagePendingActivation.value || isSwitchingStorage.value) return
  isSwitchingStorage.value = true
  try {
    await $fetch('/api/system/settings/storage/provider', {
      method: 'PUT',
      body: { value: storagePendingActivation.value.id },
    })
    await refreshCurrentStorageProvider()
    isSwitchConfirmOpen.value = false
    toast.add({
      title: $t('settings.storage.messages.saved'),
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.saveError'),
      description: (error as Error).message,
      color: 'error',
    })
  } finally {
    isSwitchingStorage.value = false
  }
}

// Identify the destination without displaying credentials or tokens.
const getStorageDestination = (storage: SettingStorageProvider) => {
  const config = storage.config
  switch (config.provider) {
    case 'local':
      return config.basePath
    case 's3':
      return config.bucket
    case 'openlist':
      return config.rootPath
  }
}

const providerOptions = computed(() => [
  {
    label: $t('settings.storage.providers.s3'),
    value: 's3',
    icon: PROVIDER_ICON.s3,
  },
  {
    label: $t('settings.storage.providers.local'),
    value: 'local',
    icon: PROVIDER_ICON.local,
  },
  {
    label: $t('settings.storage.providers.openlist'),
    value: 'openlist',
    icon: PROVIDER_ICON.openlist,
  },
])

const storageConfigState = reactive<{
  name: string
  provider: string
  config: Partial<StorageConfig>
}>({
  name: '',
  provider: 's3',
  config: {
    provider: 's3',
    region: 'auto',
    prefix: '/photos',
  } as any,
})

const editingStorage = ref<SettingStorageProvider | null>(null)
const editorOpen = ref(false)
const isSavingStorage = ref(false)
const showAdvanced = ref(false)
const initialEditorState = ref('')
const isEditorDirty = computed(
  () => JSON.stringify(storageConfigState) !== initialEditorState.value,
)
const isDiscardConfirmOpen = ref(false)
let resolveDiscard: ((discard: boolean) => void) | undefined
let pendingDiscard: Promise<boolean> | undefined

const openStorageEditor = (storage?: SettingStorageProvider) => {
  editingStorage.value = storage || null
  storageConfigState.name = storage?.name || ''
  storageConfigState.provider = storage?.provider || 's3'
  storageConfigState.config = storage
    ? { ...storage.config }
    : getStorageConfigDefaults('s3')
  showAdvanced.value = false
  initialEditorState.value = JSON.stringify(storageConfigState)
  editorOpen.value = true
}

const confirmDiscard = (discard: boolean) => {
  isDiscardConfirmOpen.value = false
  resolveDiscard?.(discard)
  resolveDiscard = undefined
  pendingDiscard = undefined
}
const canDiscardEditor = () => {
  if (!isEditorDirty.value) return Promise.resolve(true)
  if (pendingDiscard) return pendingDiscard
  isDiscardConfirmOpen.value = true
  pendingDiscard = new Promise<boolean>((resolve) => {
    resolveDiscard = resolve
  })
  return pendingDiscard
}
const requestEditorClose = async () => {
  if (isSavingStorage.value || isDiscardConfirmOpen.value) return
  if (await canDiscardEditor()) editorOpen.value = false
}

onBeforeRouteLeave(async () => {
  if (isSavingStorage.value) return false
  if (!editorOpen.value) return true
  return canDiscardEditor()
})

// 根据 provider 值动态选择对应的 schema（使用翻译后的错误消息）
const currentStorageSchema = computed(() => {
  const requiredMsg = t('settings.storage.form.isrequired')
  const provider = storageConfigState.provider
  switch (provider) {
    case 'local':
      return z.object({
        provider: z.literal('local'),
        basePath: z.string().min(1, requiredMsg),
        baseUrl: z.string().optional(),
        prefix: z.string().optional(),
      })
    case 'openlist':
      return z.object({
        provider: z.literal('openlist'),
        baseUrl: z.string().min(1, requiredMsg),
        rootPath: z.string().min(1, requiredMsg),
        token: z.string().min(1, requiredMsg),
        uploadEndpoint: z.string().default('/api/fs/put').optional(),
        downloadEndpoint: z.string().optional(),
        listEndpoint: z.string().optional(),
        deleteEndpoint: z.string().default('/api/fs/remove').optional(),
        metaEndpoint: z.string().default('/api/fs/get').optional(),
        pathField: z.string().default('path').optional(),
        cdnUrl: z.string().optional(),
      })
    case 's3':
    default:
      return z.object({
        provider: z.literal('s3'),
        bucket: z.string().min(1, requiredMsg),
        region: z.string().min(1, requiredMsg),
        endpoint: z.string().min(1, requiredMsg),
        accessKeyId: z.string().min(1, requiredMsg),
        secretAccessKey: z.string().min(1, requiredMsg),
        prefix: z.string().default('/photos').optional(),
        cdnUrl: z.string().optional(),
        forcePathStyle: z.boolean().optional(),
        maxKeys: z.number().optional(),
      })
  }
})

// 获取存储配置的默认值
const getStorageConfigDefaults = (provider: string): Partial<StorageConfig> => {
  switch (provider) {
    case 'local':
      return {
        provider: 'local',
        basePath: '/data/storage',
        baseUrl: '/storage',
        prefix: '',
      } as any
    case 'openlist':
      return {
        provider: 'openlist',
        baseUrl: '',
        rootPath: '',
        token: '',
        uploadEndpoint: '/api/fs/put',
        deleteEndpoint: '/api/fs/remove',
        metaEndpoint: '/api/fs/get',
        pathField: 'path',
        downloadEndpoint: '',
        listEndpoint: '',
        cdnUrl: '',
      } as any
    case 's3':
    default:
      return {
        provider: 's3',
        bucket: '',
        region: 'auto',
        endpoint: '',
        prefix: '/photos',
        accessKeyId: '',
        secretAccessKey: '',
        cdnUrl: '',
        forcePathStyle: false,
      } as any
  }
}

// 动态生成 fields-config，包含翻译键
const storageFieldsConfig = computed<Record<string, any>>(() => {
  const provider = storageConfigState.provider
  const baseKey = `settings.storage.${provider}`

  switch (provider) {
    case 'local':
      return {
        provider: { hidden: true },
        basePath: {
          label: $t(`${baseKey}.basePath.label`),
          description: $t(`${baseKey}.basePath.description`),
        },
        baseUrl: {
          label: $t(`${baseKey}.baseUrl.label`),
          description: $t(`${baseKey}.baseUrl.description`),
        },
        prefix: {
          label: $t(`${baseKey}.prefix.label`),
          description: $t(`${baseKey}.prefix.description`),
        },
      }
    case 'openlist':
      return {
        provider: { hidden: true },
        baseUrl: {
          label: $t(`${baseKey}.baseUrl.label`),
          description: $t(`${baseKey}.baseUrl.description`),
        },
        rootPath: {
          label: $t(`${baseKey}.rootPath.label`),
          description: $t(`${baseKey}.rootPath.description`),
        },
        token: {
          label: $t(`${baseKey}.token.label`),
          description: $t(`${baseKey}.token.description`),
        },
        uploadEndpoint: {
          label: $t(`${baseKey}.uploadEndpoint.label`),
          description: $t(`${baseKey}.uploadEndpoint.description`),
        },
        downloadEndpoint: {
          label: $t(`${baseKey}.downloadEndpoint.label`),
          description: $t(`${baseKey}.downloadEndpoint.description`),
        },
        listEndpoint: {
          label: $t(`${baseKey}.listEndpoint.label`),
          description: $t(`${baseKey}.listEndpoint.description`),
        },
        deleteEndpoint: {
          label: $t(`${baseKey}.deleteEndpoint.label`),
          description: $t(`${baseKey}.deleteEndpoint.description`),
        },
        metaEndpoint: {
          label: $t(`${baseKey}.metaEndpoint.label`),
          description: $t(`${baseKey}.metaEndpoint.description`),
        },
        pathField: {
          label: $t(`${baseKey}.pathField.label`),
          description: $t(`${baseKey}.pathField.description`),
        },
        cdnUrl: {
          label: $t(`${baseKey}.cdnUrl.label`),
          description: $t(`${baseKey}.cdnUrl.description`),
        },
      }
    case 's3':
    default:
      return {
        provider: { hidden: true },
        bucket: {
          label: $t(`${baseKey}.bucket.label`),
          description: $t(`${baseKey}.bucket.description`),
        },
        region: {
          label: $t(`${baseKey}.region.label`),
          description: $t(`${baseKey}.region.description`),
        },
        endpoint: {
          label: $t(`${baseKey}.endpoint.label`),
          description: $t(`${baseKey}.endpoint.description`),
        },
        prefix: {
          label: $t(`${baseKey}.prefix.label`),
          description: $t(`${baseKey}.prefix.description`),
        },
        cdnUrl: {
          label: $t(`${baseKey}.cdnUrl.label`),
          description: $t(`${baseKey}.cdnUrl.description`),
        },
        accessKeyId: {
          label: $t(`${baseKey}.accessKeyId.label`),
          description: $t(`${baseKey}.accessKeyId.description`),
        },
        secretAccessKey: {
          label: $t(`${baseKey}.secretAccessKey.label`),
          description: $t(`${baseKey}.secretAccessKey.description`),
        },
        forcePathStyle: {
          label: $t(`${baseKey}.forcePathStyle.label`),
          description: $t(`${baseKey}.forcePathStyle.description`),
        },
        maxKeys: {
          label: $t(`${baseKey}.maxKeys.label`),
          description: $t(`${baseKey}.maxKeys.description`),
        },
      }
  }
})

const advancedFields = computed(() => {
  switch (storageConfigState.provider) {
    case 'local':
      return ['baseUrl', 'prefix']
    case 'openlist':
      return [
        'uploadEndpoint',
        'downloadEndpoint',
        'listEndpoint',
        'deleteEndpoint',
        'metaEndpoint',
        'pathField',
        'cdnUrl',
      ]
    default:
      return ['prefix', 'cdnUrl', 'forcePathStyle', 'maxKeys']
  }
})
const editorFieldsConfig = computed(() => {
  const config = { ...storageFieldsConfig.value }
  for (const key of Object.keys(config)) {
    config[key] = { ...config[key], disabled: isSavingStorage.value }
  }
  for (const key of advancedFields.value) {
    config[key] = { ...config[key], hidden: !showAdvanced.value }
  }
  for (const key of ['secretAccessKey', 'token']) {
    if (config[key])
      config[key] = {
        ...config[key],
        inputProps: { type: 'password', autocomplete: 'off' },
      }
  }
  return config
})

const validateStorageName = () =>
  storageConfigState.name.trim()
    ? []
    : [{ name: 'storageName', message: t('settings.storage.form.isrequired') }]

const handleStorageFormError = (event: { errors: { name?: string }[] }) => {
  if (
    event.errors.some((error) =>
      advancedFields.value.includes(error.name || ''),
    )
  ) {
    showAdvanced.value = true
  }
}

const saveStorageConfig = async (event: { data: Partial<StorageConfig> }) => {
  if (isSavingStorage.value) return
  if (!storageConfigState.name.trim()) {
    return
  }
  isSavingStorage.value = true
  const isEditing = !!editingStorage.value
  try {
    const payload = {
      name: storageConfigState.name.trim(),
      provider: storageConfigState.provider,
      config: event.data,
    }
    if (editingStorage.value) {
      await $fetch(
        `/api/system/settings/storage-config/${editingStorage.value.id}`,
        {
          method: 'PUT',
          body: payload,
        },
      )
    } else {
      await $fetch('/api/system/settings/storage-config', {
        method: 'POST',
        body: payload,
      })
    }
    await Promise.all([
      refreshAvailableStorage(),
      refreshCurrentStorageProvider(),
    ])
    initialEditorState.value = JSON.stringify(storageConfigState)
    editorOpen.value = false
    toast.add({
      title: $t(
        isEditing
          ? 'settings.storage.messages.updated'
          : 'settings.storage.messages.created',
      ),
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t(
        isEditing
          ? 'settings.storage.messages.updateError'
          : 'settings.storage.messages.createError',
      ),
      description: (error as Error).message,
      color: 'error',
    })
  } finally {
    isSavingStorage.value = false
  }
}

const isDeleteConfirmOpen = ref(false)
const isDeletingStorage = ref(false)
const storagePendingDelete = ref<SettingStorageProvider | null>(null)

const openStorageDeleteConfirm = (storage: SettingStorageProvider) => {
  storagePendingDelete.value = storage
  isDeleteConfirmOpen.value = true
}

const confirmStorageDelete = async () => {
  const storageId = storagePendingDelete.value?.id
  if (
    storageId == null ||
    isDeletingStorage.value ||
    currentStorageProvider.value == null ||
    storageId === activeStorage.value?.id
  )
    return

  isDeletingStorage.value = true
  try {
    await $fetch(`/api/system/settings/storage-config/${storageId}`, {
      method: 'DELETE',
    })
    await refreshAvailableStorage()
    isDeleteConfirmOpen.value = false
    storagePendingDelete.value = null
    toast.add({
      title: $t('settings.storage.messages.deleted'),
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.deleteError'),
      description: (error as Error).message,
      color: 'error',
    })
  } finally {
    isDeletingStorage.value = false
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.storageSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section
          class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800"
        >
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {{ $t('title.storageSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.storage.sectionDescription') }}
          </p>
        </section>

        <section
          class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        >
          <header
            class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <h3
              class="text-base font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {{ $t('settings.storage.sections.management') }}
            </h3>
            <UButton
              data-tour="storage-add"
              icon="tabler:plus"
              :disabled="isSwitchingStorage || isDeletingStorage"
              @click="openStorageEditor()"
            >
              {{ $t('settings.storage.actions.add') }}
            </UButton>
          </header>

          <div
            v-if="
              (availableStorageStatus === 'pending' && !availableStorage) ||
              (currentStorageStatus === 'pending' && !currentStorageProvider)
            "
            class="space-y-3 px-5 py-5"
          >
            <USkeleton
              v-for="index in 3"
              :key="index"
              class="h-24 w-full"
            />
          </div>
          <div
            v-else-if="
              availableStorageStatus === 'error' ||
              currentStorageStatus === 'error'
            "
            class="space-y-4 px-5 py-5"
          >
            <UAlert
              color="error"
              variant="subtle"
              icon="tabler:alert-circle"
              :title="$t('settings.form.loadFailed')"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="tabler:refresh"
              @click="
                Promise.all([
                  refreshAvailableStorage(),
                  refreshCurrentStorageProvider(),
                ])
              "
            >
              {{ $t('settings.storage.actions.retry') }}
            </UButton>
          </div>
          <div
            v-else-if="!sortedStorage.length"
            class="flex flex-col items-center gap-3 px-5 py-12 text-center"
          >
            <Icon
              name="tabler:database"
              class="size-10 text-neutral-400"
            />
            <h4 class="font-medium">
              {{ $t('settings.storage.empty.title') }}
            </h4>
            <p class="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              {{ $t('settings.storage.empty.description') }}
            </p>
            <UButton
              icon="tabler:plus"
              @click="openStorageEditor()"
              >{{ $t('settings.storage.actions.add') }}</UButton
            >
          </div>
          <div
            v-else
            data-tour="storage-default"
            class="divide-y divide-neutral-200 dark:divide-neutral-800"
          >
            <article
              v-for="storage in sortedStorage"
              :key="storage.id"
              class="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex size-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-900"
                >
                  <Icon
                    :name="PROVIDER_ICON[storage.provider]"
                    class="size-5 text-neutral-600 dark:text-neutral-400"
                  />
                </div>
                <div class="min-w-0 space-y-0.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <h4
                      class="break-all font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      {{ storage.name }}
                    </h4>
                    <UBadge
                      v-if="storage.id === activeStorage?.id"
                      color="success"
                      variant="subtle"
                      size="sm"
                    >
                      {{ $t('settings.storage.active') }}
                    </UBadge>
                  </div>
                  <div
                    class="flex min-w-0 items-center gap-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400"
                  >
                    <span class="shrink-0">{{
                      $t(`settings.storage.providers.${storage.provider}`)
                    }}</span>
                    <template v-if="getStorageDestination(storage)">
                      <span
                        aria-hidden="true"
                        class="text-neutral-300 dark:text-neutral-700"
                        >·</span
                      >
                      <span
                        class="truncate"
                        :title="getStorageDestination(storage)"
                        >{{ getStorageDestination(storage) }}</span
                      >
                    </template>
                  </div>
                </div>
              </div>
              <div
                class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="tabler:pencil"
                  :disabled="isSwitchingStorage || isDeletingStorage"
                  @click="openStorageEditor(storage)"
                >
                  {{ $t('common.actions.edit') }}
                </UButton>
                <UButton
                  v-if="storage.id !== activeStorage?.id"
                  color="neutral"
                  variant="soft"
                  icon="tabler:arrows-exchange"
                  :disabled="isSwitchingStorage || isDeletingStorage"
                  @click="requestStorageActivation(storage)"
                >
                  {{ $t('settings.storage.actions.activate') }}
                </UButton>
                <UDropdownMenu
                  :items="[
                    {
                      label: $t('common.actions.delete'),
                      icon: 'tabler:trash',
                      color: 'error',
                      disabled: storage.id === activeStorage?.id,
                      onSelect: () => openStorageDeleteConfirm(storage),
                    },
                  ]"
                >
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="tabler:dots"
                    :aria-label="
                      $t('settings.storage.moreActions', { name: storage.name })
                    "
                    :disabled="isSwitchingStorage || isDeletingStorage"
                  />
                </UDropdownMenu>
              </div>
            </article>
          </div>
          <footer
            v-if="sortedStorage.length"
            class="border-t border-neutral-200 px-5 py-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
          >
            {{ $t('settings.storage.changeModal.alertDescription') }}
          </footer>
        </section>

        <USlideover
          :open="editorOpen"
          :dismissible="!isSavingStorage"
          :close="!isSavingStorage"
          :title="
            $t(
              editingStorage
                ? 'settings.storage.slideover.editTitle'
                : 'settings.storage.slideover.title',
            )
          "
          :ui="{
            content: 'sm:max-w-xl',
            footer: 'flex-col items-stretch gap-3',
          }"
          @update:open="
            (open) => {
              if (!open) requestEditorClose()
            }
          "
        >
          <template #body>
            <div class="space-y-5">
              <UAlert
                v-if="
                  editingStorage?.id === activeStorage?.id && editingStorage
                "
                color="info"
                variant="subtle"
                icon="tabler:info-circle"
                :title="$t('settings.storage.editActiveHint')"
              />
              <AutoForm
                :key="storageConfigState.provider"
                id="storageConfigForm"
                :schema="currentStorageSchema"
                :state="storageConfigState.config"
                :fields-config="editorFieldsConfig"
                :disabled="isSavingStorage"
                :validate="validateStorageName"
                @submit="saveStorageConfig"
                @error="handleStorageFormError"
              >
                <template #before>
                  <div class="mb-5 space-y-5">
                    <UFormField
                      :label="$t('settings.storage.form.nameLabel')"
                      required
                      name="storageName"
                    >
                      <UInput
                        v-model="storageConfigState.name"
                        class="w-full"
                        :disabled="isSavingStorage"
                        :placeholder="
                          $t('settings.storage.form.namePlaceholder')
                        "
                        autofocus
                      />
                    </UFormField>
                    <UFormField
                      :label="$t('settings.storage.form.typeLabel')"
                      required
                    >
                      <USelect
                        v-model="storageConfigState.provider"
                        class="w-full"
                        :icon="
                          PROVIDER_ICON[
                            storageConfigState.provider as keyof typeof PROVIDER_ICON
                          ]
                        "
                        :items="providerOptions"
                        value-key="value"
                        :disabled="!!editingStorage || isSavingStorage"
                        @update:model-value="
                          (value) => {
                            storageConfigState.config =
                              getStorageConfigDefaults(value)
                            showAdvanced = false
                          }
                        "
                      />
                    </UFormField>
                    <AlbumProtectionWarning
                      v-if="storageConfigState.provider !== 'local'"
                    />
                    <USeparator />
                  </div>
                </template>
                <UButton
                  class="mt-5"
                  color="neutral"
                  variant="link"
                  :icon="
                    showAdvanced ? 'tabler:chevron-up' : 'tabler:chevron-down'
                  "
                  :aria-expanded="showAdvanced"
                  :disabled="isSavingStorage"
                  @click="showAdvanced = !showAdvanced"
                >
                  {{ $t('settings.storage.advancedSettings') }}
                </UButton>
              </AutoForm>
            </div>
          </template>
          <template #footer>
            <p
              v-if="isEditorDirty"
              class="text-sm text-warning"
            >
              {{ $t('common.unsavedChanges') }}
            </p>
            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="isSavingStorage"
                @click="requestEditorClose"
                >{{ $t('common.actions.cancel') }}</UButton
              >
              <UButton
                icon="tabler:device-floppy"
                type="submit"
                form="storageConfigForm"
                :loading="isSavingStorage"
                :disabled="!isEditorDirty"
              >
                {{
                  $t(
                    editingStorage
                      ? 'common.actions.save'
                      : 'settings.storage.actions.create',
                  )
                }}
              </UButton>
            </div>
          </template>
        </USlideover>

        <UModal
          :open="isDiscardConfirmOpen"
          :title="$t('settings.storage.discard.title')"
          :ui="{ footer: 'justify-end' }"
          @update:open="
            (open) => {
              if (!open) confirmDiscard(false)
            }
          "
        >
          <template #body
            ><p class="text-sm text-neutral-500 dark:text-neutral-400">
              {{ $t('settings.storage.discard.description') }}
            </p></template
          >
          <template #footer>
            <UButton
              color="neutral"
              variant="outline"
              @click="confirmDiscard(false)"
              >{{ $t('settings.storage.actions.keepEditing') }}</UButton
            >
            <UButton
              color="warning"
              @click="confirmDiscard(true)"
              >{{ $t('settings.storage.actions.discard') }}</UButton
            >
          </template>
        </UModal>

        <UModal
          v-model:open="isSwitchConfirmOpen"
          :dismissible="!isSwitchingStorage"
          :close="!isSwitchingStorage"
          :title="$t('settings.storage.changeModal.title')"
          :ui="{ footer: 'justify-end' }"
        >
          <template #body>
            <div class="space-y-4">
              <p class="text-sm">
                {{
                  $t('settings.storage.changeModal.target', {
                    name: storagePendingActivation?.name,
                  })
                }}
              </p>
              <UAlert
                color="warning"
                variant="subtle"
                icon="tabler:arrows-exchange"
                :title="$t('settings.storage.changeModal.alertTitle')"
                :description="
                  $t('settings.storage.changeModal.alertDescription')
                "
              />
            </div>
          </template>
          <template #footer>
            <UButton
              color="neutral"
              variant="outline"
              :disabled="isSwitchingStorage"
              @click="isSwitchConfirmOpen = false"
              >{{ $t('common.actions.cancel') }}</UButton
            >
            <UButton
              icon="tabler:arrows-exchange"
              :loading="isSwitchingStorage"
              @click="confirmStorageActivation"
              >{{ $t('settings.storage.actions.activate') }}</UButton
            >
          </template>
        </UModal>

        <UModal
          v-model:open="isDeleteConfirmOpen"
          :dismissible="!isDeletingStorage"
          :close="!isDeletingStorage"
          :title="$t('settings.storage.deleteModal.title')"
          :ui="{ footer: 'justify-end' }"
        >
          <template #body>
            <p
              class="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400"
            >
              {{
                $t('settings.storage.deleteModal.message', {
                  name: storagePendingDelete?.name,
                })
              }}
            </p>
          </template>
          <template #footer>
            <UButton
              color="neutral"
              variant="outline"
              :disabled="isDeletingStorage"
              @click="isDeleteConfirmOpen = false"
              >{{ $t('common.actions.cancel') }}</UButton
            >
            <UButton
              color="error"
              icon="tabler:trash"
              :loading="isDeletingStorage"
              @click="confirmStorageDelete"
              >{{ $t('common.actions.delete') }}</UButton
            >
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
