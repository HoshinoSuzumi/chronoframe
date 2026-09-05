<script lang="ts" setup>
import { z } from 'zod'
import { UChip, UButton } from '#components'
import type { TableColumn } from '@nuxt/ui'
import type { StorageConfig } from '~~/shared/types/storage'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.storageSettings'),
})

const toast = useToast()
const { t } = useI18n()

const { data: currentStorageProvider, refresh: refreshCurrentStorageProvider } =
  await useFetch<{
    namespace: string
    key: string
    value: SettingValue
  }>('/api/system/settings/storage/provider')

const {
  data: availableStorage,
  refresh: refreshAvailableStorage,
  status: availableStorageStatus,
} =
  await useFetch<SettingStorageProvider[]>(
    '/api/system/settings/storage-config',
  )

const PROVIDER_ICON = {
  s3: 'tabler:brand-aws',
  local: 'tabler:database',
  openlist: 'tabler:cloud',
}

const availableStorageColumns = computed<TableColumn<SettingStorageProvider>[]>(
  () => [
  {
    accessorKey: 'status',
    header: '',
    meta: {
      class: {
        th: 'w-10',
      },
    },
    cell: (cell) => {
      const isActive =
        currentStorageProvider.value?.value === cell.row.original.id
      return h(UChip, {
        size: 'md',
        inset: true,
        standalone: true,
        color: isActive ? 'success' : undefined,
        ui: {
          base: !isActive ? 'bg-neutral-200 dark:bg-neutral-700' : '',
        },
      })
    },
  },
  { accessorKey: 'name', header: $t('settings.storage.table.columns.name') },
  { accessorKey: 'provider', header: $t('settings.storage.table.columns.type') },
  {
    accessorKey: 'actions',
    header: $t('settings.storage.table.columns.actions'),
    cell: (cell) => {
      return h('div', { class: 'flex items-center gap-2' }, [
        h(
          UButton,
          {
            size: 'sm',
            variant: 'soft',
            color: 'info',
            icon: 'tabler:pencil',
            onClick: () => onStorageEdit(cell.row.original),
          },
          { default: () => $t('common.actions.edit') },
        ),
        h(
          UButton,
          {
            size: 'sm',
            variant: 'soft',
            color: 'error',
            icon: 'tabler:trash',
            disabled:
              currentStorageProvider.value?.value === cell.row.original.id,
            onClick: () => onStorageDelete(cell.row.original.id),
          },
          { default: () => $t('common.actions.delete') },
        ),
      ])
    },
  },
  ],
)

const storageSettingsState = reactive<{
  storageConfigId?: number
}>({
  storageConfigId: currentStorageProvider.value
    ? (currentStorageProvider.value.value as number)
    : undefined,
})

const isStorageDefaultDirty = computed(() => {
  return storageSettingsState.storageConfigId !== currentStorageProvider.value?.value
})

const resetStorageDefault = () => {
  storageSettingsState.storageConfigId = currentStorageProvider.value
    ? (currentStorageProvider.value.value as number)
    : undefined
}

const handleStorageSettingsSubmit = async (close?: () => void) => {
  try {
    await $fetch('/api/system/settings/storage/provider', {
      method: 'PUT',
      body: {
        value: storageSettingsState.storageConfigId,
      },
    })
    refreshCurrentStorageProvider()
    close?.()
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
  }
}

const providerOptions = computed(() => [
  { label: $t('settings.storage.providers.s3'), value: 's3', icon: PROVIDER_ICON.s3 },
  { label: $t('settings.storage.providers.local'), value: 'local', icon: PROVIDER_ICON.local },
  { label: $t('settings.storage.providers.openlist'), value: 'openlist', icon: PROVIDER_ICON.openlist },
])

// Translate zod validation error messages
const translateStorageError = (message: string, name?: string): string => {
  const field = name || ''
  if (message.includes('expected string, received undefined')) {
    return t('settings.storage.form.isrequired', { field })
  }
  if (message.includes('Too small') || message.includes('too_small') || message.includes('at least 1 character')) {
    return t('settings.storage.form.isrequired', { field })
  }
  return message
}

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

// 编辑状态
const editingStorage = ref<SettingStorageProvider | null>(null)
const editSlideoverOpen = ref(false)
const nameError = ref('')

const openEditSlideover = (storage: SettingStorageProvider) => {
  editingStorage.value = storage
  storageConfigState.name = storage.name
  storageConfigState.provider = storage.provider
  storageConfigState.config = { ...(storage.config as Partial<StorageConfig>) }
  nameError.value = ''
  editSlideoverOpen.value = true
}

const closeEditSlideover = () => {
  editSlideoverOpen.value = false
  editingStorage.value = null
  resetStorageConfigForm()
}

// 编辑 slideover 关闭时（无论通过何种方式）重置表单
watch(editSlideoverOpen, (open) => {
  if (!open) {
    editingStorage.value = null
    resetStorageConfigForm()
  }
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
        prefix: z.string().default('/photos').optional(),
        cdnUrl: z.string().optional(),
        accessKeyId: z.string().min(1, requiredMsg),
        secretAccessKey: z.string().min(1, requiredMsg),
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

const onStorageConfigSubmit = async (
  event: { data: Partial<StorageConfig> },
  close?: () => void,
) => {
  if (!storageConfigState.name.trim()) {
    nameError.value = t('settings.storage.form.isrequired', { field: t('settings.storage.form.nameLabel') })
    return
  }
  nameError.value = ''
  try {
    const payload = {
      name: storageConfigState.name,
      provider: storageConfigState.provider,
      config: event.data,
    }

    await $fetch('/api/system/settings/storage-config', {
      method: 'POST',
      body: payload,
    })
    refreshAvailableStorage()
    toast.add({
      title: $t('settings.storage.messages.created'),
      color: 'success',
    })
    resetStorageConfigForm()
    close?.()
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.createError'),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

const onStorageDelete = async (storageId: number) => {
  try {
    await $fetch(`/api/system/settings/storage-config/${storageId}`, {
      method: 'DELETE',
    })
    refreshAvailableStorage()
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
  }
}

const onStorageEdit = (storage: SettingStorageProvider) => {
  openEditSlideover(storage)
}

const onStorageConfigUpdate = async (
  event: { data: Partial<StorageConfig> },
  close?: () => void,
) => {
  if (!editingStorage.value) return
  if (!storageConfigState.name.trim()) {
    nameError.value = t('settings.storage.form.isrequired', { field: t('settings.storage.form.nameLabel') })
    return
  }
  nameError.value = ''
  try {
    const payload = {
      name: storageConfigState.name,
      provider: storageConfigState.provider,
      config: event.data,
    }

    await $fetch(`/api/system/settings/storage-config/${editingStorage.value.id}`, {
      method: 'PUT',
      body: payload,
    })
    refreshAvailableStorage()
    refreshCurrentStorageProvider()
    toast.add({
      title: $t('settings.storage.messages.updated'),
      color: 'success',
    })
    closeEditSlideover()
    close?.()
  } catch (error) {
    toast.add({
      title: $t('settings.storage.messages.updateError'),
      description: (error as Error).message,
      color: 'error',
    })
  }
}

const resetStorageConfigForm = () => {
  storageConfigState.name = ''
  storageConfigState.provider = 's3'
  storageConfigState.config = getStorageConfigDefaults('s3')
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.storageSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.storageSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.storage.sectionDescription') }}
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('settings.storage.sections.currentDefault') }}
            </h3>
          </header>

          <div
            v-if="availableStorageStatus !== 'success' && !availableStorage"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-10 w-72" />
          </div>

          <div
            v-else
            class="space-y-4 px-5 py-5"
          >
            <UFormField
              name="storageConfigId"
              :label="$t('settings.storage.form.schemeLabel')"
              required
              :ui="{
                container: 'w-full sm:max-w-sm *:w-full',
              }"
            >
              <USelectMenu
                v-model="storageSettingsState.storageConfigId"
                :icon="
                  PROVIDER_ICON[
                    availableStorage?.find(
                      (item) =>
                        item.id === storageSettingsState.storageConfigId,
                    )?.provider || 'local'
                  ] || 'tabler:database'
                "
                :items="
                  availableStorage?.map((item) => ({
                    icon: PROVIDER_ICON[item.provider] || 'tabler:database',
                    label: item.name,
                    value: item.id,
                  }))
                "
                label-key="label"
                value-key="value"
                :placeholder="$t('settings.storage.form.schemePlaceholder')"
              />
            </UFormField>
          </div>

          <footer class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div
              v-if="isStorageDefaultDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isStorageDefaultDirty"
                @click="resetStorageDefault"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UModal
                :title="$t('settings.storage.changeModal.title')"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  :disabled="!isStorageDefaultDirty"
                  icon="tabler:device-floppy"
                >
                  {{ $t('common.actions.saveSettings') }}
                </UButton>

                <template #body>
                  <UAlert
                    color="neutral"
                    variant="subtle"
                    :title="$t('settings.storage.changeModal.alertTitle')"
                    :description="$t('settings.storage.changeModal.alertDescription')"
                    icon="tabler:arrows-exchange"
                  />
                </template>

                <template #footer="{ close }">
                  <UButton
                    :label="$t('common.actions.cancel')"
                    color="neutral"
                    variant="outline"
                    @click="close"
                  />
                  <UButton
                    :label="$t('common.actions.continue')"
                    variant="soft"
                    icon="tabler:arrows-exchange"
                    type="submit"
                    form="storageSettingsForm"
                    @click="handleStorageSettingsSubmit(close)"
                  />
                </template>
              </UModal>
            </div>
          </footer>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="flex w-full items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('settings.storage.sections.management') }}
            </h3>
            <div>
              <USlideover
                :title="$t('settings.storage.slideover.title')"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  size="sm"
                  variant="soft"
                  icon="tabler:plus"
                >
                  {{ $t('settings.storage.actions.add') }}
                </UButton>

                <template #body="{ close }">
                  <div class="space-y-4">
                    <!-- Provider 选择 -->
                    <UFormField
                      :label="$t('settings.storage.form.typeLabel')"
                      class="w-full"
                      required
                      :ui="{
                        container: 'sm:max-w-full',
                      }"
                    >
                      <USelectMenu
                        v-model="storageConfigState.provider"
                        :icon="
                          PROVIDER_ICON[
                            storageConfigState.provider as keyof typeof PROVIDER_ICON
                          ] || 'tabler:database'
                        "
                        :items="providerOptions"
                        label-key="label"
                        value-key="value"
                        :placeholder="$t('settings.storage.form.typePlaceholder')"
                        @update:model-value="
                          (val: string) => {
                            storageConfigState.provider = val
                            storageConfigState.config =
                              getStorageConfigDefaults(val)
                          }
                        "
                      />
                    </UFormField>

                    <UFormField
                      :label="$t('settings.storage.form.nameLabel')"
                      required
                      :error="nameError"
                      :ui="{
                        container: 'sm:max-w-full',
                      }"
                    >
                      <UInput v-model="storageConfigState.name" @update:model-value="nameError = ''" />
                    </UFormField>

                    <USeparator />

                    <AutoForm
                      id="createStorageForm"
                      :schema="currentStorageSchema"
                      :state="storageConfigState.config"
                      :fields-config="storageFieldsConfig"
                      :translate-error="translateStorageError"
                      @submit="onStorageConfigSubmit($event, close)"
                    />
                  </div>
                </template>

                <template #footer="{ close }">
                  <UButton
                    :label="$t('common.actions.cancel')"
                    color="neutral"
                    variant="outline"
                    @click="close"
                  />
                  <UButton
                    :label="$t('settings.storage.actions.create')"
                    variant="soft"
                    icon="tabler:check"
                    type="submit"
                    form="createStorageForm"
                  />
                </template>
              </USlideover>
            </div>
          </header>

          <div
            v-if="availableStorageStatus !== 'success' && !availableStorage"
            class="space-y-3 px-5 py-5"
          >
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-10 w-full" />
          </div>

          <div
            v-else
            class="px-0 py-0"
          >
            <UTable
              :columns="availableStorageColumns"
              :data="availableStorage"
            />
          </div>
        </section>

        <!-- Edit Storage Slideover -->
        <USlideover
          v-model:open="editSlideoverOpen"
          :title="$t('settings.storage.slideover.editTitle')"
          :ui="{ footer: 'justify-end' }"
        >
          <template #body="{ close }">
            <div class="space-y-4">
              <UFormField
                :label="$t('settings.storage.form.typeLabel')"
                class="w-full"
                required
                :ui="{
                  container: 'sm:max-w-full',
                }"
              >
                <USelectMenu
                  v-model="storageConfigState.provider"
                  :icon="
                    PROVIDER_ICON[
                      storageConfigState.provider as keyof typeof PROVIDER_ICON
                    ] || 'tabler:database'
                  "
                  :items="providerOptions"
                  label-key="label"
                  value-key="value"
                  disabled
                />
              </UFormField>

              <UFormField
                :label="$t('settings.storage.form.nameLabel')"
                required
                :error="nameError"
                :ui="{
                  container: 'sm:max-w-full',
                }"
              >
                <UInput v-model="storageConfigState.name" @update:model-value="nameError = ''" />
              </UFormField>

              <USeparator />

              <AutoForm
                id="editStorageForm"
                :schema="currentStorageSchema"
                :state="storageConfigState.config"
                :fields-config="storageFieldsConfig"
                :translate-error="translateStorageError"
                @submit="onStorageConfigUpdate($event, close)"
              />
            </div>
          </template>

          <template #footer="{ close }">
            <UButton
              :label="$t('common.actions.cancel')"
              color="neutral"
              variant="outline"
              @click="closeEditSlideover"
            />
            <UButton
              :label="$t('common.actions.save')"
              variant="soft"
              icon="tabler:check"
              type="submit"
              form="editStorageForm"
            />
          </template>
        </USlideover>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
