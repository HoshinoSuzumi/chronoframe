<script lang="ts" setup>
import { UChip, UButton } from '#components'
import type { TableColumn } from '@nuxt/ui'
import {
  s3StorageConfigSchema,
  localStorageConfigSchema,
  openListStorageConfigSchema,
  type StorageConfig,
} from '~~/shared/types/storage'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.storageSettings'),
})

const toast = useToast()

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

const availableStorageColumns: TableColumn<SettingStorageProvider>[] = [
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
  { accessorKey: 'name', header: '存储名称' },
  { accessorKey: 'provider', header: '存储类型' },
  {
    accessorKey: 'actions',
    header: '操作',
    cell: (cell) => {
      return h('div', { class: 'flex items-center gap-2' }, [
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
          { default: () => '删除' },
        ),
      ])
    },
  },
]

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
      title: '设置已保存',
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: '保存设置时出错',
      description: (error as Error).message,
      color: 'error',
    })
  }
}

const providerOptions = [
  { label: 'AWS S3 兼容存储', value: 's3', icon: PROVIDER_ICON.s3 },
  { label: '本地存储', value: 'local', icon: PROVIDER_ICON.local },
  { label: 'OpenList', value: 'openlist', icon: PROVIDER_ICON.openlist },
]

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

// 根据 provider 值动态选择对应的 schema
const currentStorageSchema = computed(() => {
  const provider = storageConfigState.provider
  switch (provider) {
    case 'local':
      return localStorageConfigSchema
    case 'openlist':
      return openListStorageConfigSchema
    case 's3':
    default:
      return s3StorageConfigSchema
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
      } as any
    case 'openlist':
      return {
        provider: 'openlist',
        uploadEndpoint: '/api/fs/put',
        deleteEndpoint: '/api/fs/remove',
        metaEndpoint: '/api/fs/get',
        pathField: 'path',
      } as any
    case 's3':
    default:
      return {
        provider: 's3',
        region: 'auto',
        prefix: '/photos',
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
      title: '存储方案已创建',
      color: 'success',
    })
    // 重置表单
    storageConfigState.name = ''
    storageConfigState.provider = 's3'
    storageConfigState.config = getStorageConfigDefaults('s3')
    close?.()
  } catch (error) {
    toast.add({
      title: '创建存储方案时出错',
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
      title: '存储方案已删除',
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: '删除存储方案失败',
      description: (error as Error).message,
      color: 'error',
    })
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
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.storageSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            管理默认存储方案与可用存储提供者。此页面的设置仅影响后续上传文件。
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              当前默认存储
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
              label="存储方案"
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
                placeholder="选择存储方案"
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
                重置
              </UButton>
              <UModal
                title="变更存储方案"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  :disabled="!isStorageDefaultDirty"
                  icon="tabler:device-floppy"
                >
                  保存设置
                </UButton>

                <template #body>
                  <UAlert
                    color="neutral"
                    variant="subtle"
                    title="注意"
                    description="变更存储方案之后上传的文件将会存储到新的存储方案中，原方案中已有文件不会被迁移。"
                    icon="tabler:arrows-exchange"
                  />
                </template>

                <template #footer="{ close }">
                  <UButton
                    label="取消"
                    color="neutral"
                    variant="outline"
                    @click="close"
                  />
                  <UButton
                    label="继续"
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
              存储方案管理
            </h3>
            <div>
              <USlideover
                title="创建存储方案"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  size="sm"
                  variant="soft"
                  icon="tabler:plus"
                >
                  添加存储
                </UButton>

                <template #body="{ close }">
                  <div class="space-y-4">
                    <!-- Provider 选择 -->
                    <UFormField
                      label="存储类型"
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
                        placeholder="选择存储类型"
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
                      label="存储名称"
                      required
                      :ui="{
                        container: 'sm:max-w-full',
                      }"
                    >
                      <UInput v-model="storageConfigState.name" />
                    </UFormField>

                    <USeparator />

                    <AutoForm
                      id="createStorageForm"
                      :schema="currentStorageSchema"
                      :state="storageConfigState.config"
                      :fields-config="storageFieldsConfig"
                      @submit="onStorageConfigSubmit($event, close)"
                    />
                  </div>
                </template>

                <template #footer="{ close }">
                  <UButton
                    label="取消"
                    color="neutral"
                    variant="outline"
                    @click="close"
                  />
                  <UButton
                    label="创建存储"
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
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
