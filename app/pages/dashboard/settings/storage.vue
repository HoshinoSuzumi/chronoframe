<script lang="ts" setup>
import { UButton, UChip } from '#components'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import z from 'zod'
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

const { data: availableStorage, refresh: refreshAvailableStorage } =
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

const storageSettingsSchema = z.object({
  storageConfigId: z.number({ error: '请选择存储方案' }),
})

type StorageSettingsSchema = z.output<typeof storageSettingsSchema>

const storageSettingsState = reactive<Partial<StorageSettingsSchema>>({
  storageConfigId: currentStorageProvider.value
    ? (currentStorageProvider.value.value as number)
    : undefined,
})

const onStorageSettingsSubmit = async (
  event: FormSubmitEvent<StorageSettingsSchema>,
) => {
  try {
    await $fetch('/api/system/settings/storage/provider', {
      method: 'PUT',
      body: {
        value: event.data.storageConfigId,
      },
    })
    refreshCurrentStorageProvider()
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

// 存储方案类型选项
const providerOptions = [
  { label: 'AWS S3 兼容存储', value: 's3', icon: PROVIDER_ICON.s3 },
  { label: '本地存储', value: 'local', icon: PROVIDER_ICON.local },
  { label: 'OpenList', value: 'openlist', icon: PROVIDER_ICON.openlist },
]

// 存储配置表单状态
const storageConfigState = reactive<{
  name: string
  provider: string
  config: Partial<StorageConfig>
}>({
  name: '',
  provider: 's3',
  config: {
    provider: 's3',
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
        'endpoints.upload': {
          label: $t(`${baseKey}.endpoints.upload.label`),
          description: $t(`${baseKey}.endpoints.upload.description`),
        },
        'endpoints.download': {
          label: $t(`${baseKey}.endpoints.download.label`),
          description: $t(`${baseKey}.endpoints.download.description`),
        },
        'endpoints.list': {
          label: $t(`${baseKey}.endpoints.list.label`),
          description: $t(`${baseKey}.endpoints.list.description`),
        },
        'endpoints.delete': {
          label: $t(`${baseKey}.endpoints.delete.label`),
          description: $t(`${baseKey}.endpoints.delete.description`),
        },
        'endpoints.meta': {
          label: $t(`${baseKey}.endpoints.meta.label`),
          description: $t(`${baseKey}.endpoints.meta.description`),
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
  event: FormSubmitEvent<Partial<StorageConfig>>,
) => {
  try {
    // 构建完整的请求体
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
    Object.assign(storageConfigState, {
      name: '',
      provider: 's3',
      config: { provider: 's3' },
    })
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
      <div class="space-y-6 max-w-6xl">
        <UCard variant="outline">
          <UForm
            id="storageSettingsForm"
            :schema="storageSettingsSchema"
            :state="storageSettingsState"
            class="space-y-4"
            @submit="onStorageSettingsSubmit"
          >
            <UFormField
              name="storageConfigId"
              label="存储方案"
              required
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
          </UForm>

          <template #footer>
            <div class="flex items-center gap-3">
              <UModal
                title="变更存储方案"
                :ui="{ footer: 'justify-end' }"
              >
                <UButton
                  variant="soft"
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
                    @click="close"
                  />
                </template>
              </UModal>
            </div>
          </template>
        </UCard>

        <UCard
          variant="outline"
          :ui="{
            body: 'p-0 sm:p-0',
          }"
        >
          <template #header>
            <div class="w-full flex items-center justify-between">
              <span>存储方案管理</span>
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

                  <template #body>
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
                              ;(storageConfigState.config as any).provider = val
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
                        @submit="onStorageConfigSubmit"
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
                      icon="i-heroicons-check"
                      type="submit"
                      form="createStorageForm"
                      @click="close"
                    />
                  </template>
                </USlideover>
              </div>
            </div>
          </template>

          <div>
            <UTable
              :columns="availableStorageColumns"
              :data="availableStorage"
            />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
