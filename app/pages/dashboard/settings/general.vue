<script lang="ts" setup>
import type { FormSubmitEvent } from '@nuxt/ui'
import z from 'zod'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.generalSettings'),
})

const toast = useToast()
const colorMode = useColorMode()

// 获取 schema 信息，用于获取枚举值和翻译键
const { data: settingsSchema } = await useFetch<
  Array<{
    namespace: string
    key: string
    type: string
    value: any
    defaultValue: any
    label: string
    description: string
    enum?: string[]
    isReadonly?: boolean
    isSecret?: boolean
  }>
>('/api/system/settings/schema')

// 获取当前 app namespace 的所有设置
const { data: appSettings, refresh: refreshAppSettings } = await useFetch<{
  namespace: string
  settings: Record<string, any>
}>('/api/system/settings/app')

// 表单 schema
const appSettingsSchema = z.object({
  title: z.string().min(1, '应用名称不能为空'),
  slogan: z.string().optional(),
  author: z.string().optional(),
  avatarUrl: z.string().url('请输入有效的 URL').optional().or(z.literal('')),
})

type AppSettingsSchema = z.output<typeof appSettingsSchema>

// 外观设置 schema - 动态生成，基于 API 返回的枚举值
const appearanceSettingsSchema = computed(() => {
  const themeOption = settingsSchema.value?.find(
    (s) => s.namespace === 'app' && s.key === 'appearance.theme',
  )
  const themeEnum = (themeOption?.enum || ['light', 'dark', 'system']) as [
    string,
    ...string[],
  ]
  return z.object({
    'appearance.theme': z.enum(themeEnum),
  })
})

type AppearanceSettingsSchema = {
  'appearance.theme': string
}

// 获取 schema 中的默认值
const getSchemaDefaultValue = (namespace: string, key: string) => {
  const schema = settingsSchema.value?.find(
    (s) => s.namespace === namespace && s.key === key,
  )
  return schema?.defaultValue ?? ''
}

// 初始化表单状态
const appSettingsState = reactive<Partial<AppSettingsSchema>>({
  title: getSchemaDefaultValue('app', 'title') || 'ChronoFrame',
  slogan: getSchemaDefaultValue('app', 'slogan') || '',
  author: getSchemaDefaultValue('app', 'author') || '',
  avatarUrl: getSchemaDefaultValue('app', 'avatarUrl') || '',
})

// 初始化外观设置表单状态
const appearanceSettingsState = reactive<Partial<AppearanceSettingsSchema>>({
  'appearance.theme': getSchemaDefaultValue('app', 'appearance.theme') || 'system',
})

// 计算主题选项
const themeOptions = computed(() => {
  const themeOption = settingsSchema.value?.find(
    (s) => s.namespace === 'app' && s.key === 'appearance.theme',
  )
  const themeEnums = themeOption?.enum || ['light', 'dark', 'system']
  return themeEnums.map((value) => ({
    label: $t(`settings.app.appearance.theme.${value}`),
    value,
  }))
})

// 监听 appSettings 数据加载，初始化表单
watch(
  () => appSettings.value,
  (settings) => {
    if (settings?.settings && typeof settings.settings === 'object') {
      // settings 是一个对象，直接从中提取值
      appSettingsState.title = settings.settings.title || 'ChronoFrame'
      appSettingsState.slogan = settings.settings.slogan || ''
      appSettingsState.author = settings.settings.author || ''
      appSettingsState.avatarUrl = settings.settings.avatarUrl || ''
      appearanceSettingsState['appearance.theme'] =
        settings.settings['appearance.theme'] || 'system'
    }
  },
  { immediate: true },
)

const onAppSettingsSubmit = async (
  event: FormSubmitEvent<AppSettingsSchema>,
) => {
  try {
    // 并行更新所有设置
    const updatePromises = Object.entries(event.data).map(([key, value]) =>
      $fetch(`/api/system/settings/app/${key}`, {
        method: 'PUT',
        body: { value: value || null },
      }),
    )

    await Promise.all(updatePromises)
    refreshAppSettings()
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

const onAppearanceSettingsSubmit = async (
  event: FormSubmitEvent<AppearanceSettingsSchema>,
) => {
  try {
    // 并行更新所有设置
    const updatePromises = Object.entries(event.data).map(([key, value]) =>
      $fetch(`/api/system/settings/app/${key}`, {
        method: 'PUT',
        body: { value: value || null },
      }),
    )

    await Promise.all(updatePromises)
    colorMode.preference = event.data['appearance.theme']
    refreshAppSettings()
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
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.generalSettings')" />
    </template>

    <template #body>
      <div class="space-y-6 max-w-6xl">
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.generalSettings') }}</span>
          </template>

          <UForm
            id="appSettingsForm"
            :schema="appSettingsSchema"
            :state="appSettingsState"
            class="space-y-4"
            @submit="onAppSettingsSubmit"
          >
            <UFormField
              name="title"
              :label="$t('settings.app.title.label')"
              :description="$t('settings.app.title.description')"
              required
            >
              <UInput v-model="appSettingsState.title" />
            </UFormField>

            <UFormField
              name="slogan"
              :label="$t('settings.app.slogan.label')"
              :description="$t('settings.app.slogan.description')"
            >
              <UInput v-model="appSettingsState.slogan" />
            </UFormField>

            <UFormField
              name="author"
              :label="$t('settings.app.author.label')"
              :description="$t('settings.app.author.description')"
            >
              <UInput v-model="appSettingsState.author" />
            </UFormField>

            <UFormField
              name="avatarUrl"
              :label="$t('settings.app.avatarUrl.label')"
              :description="$t('settings.app.avatarUrl.description')"
              help="请输入一个有效的图片 URL"
            >
              <UInput
                v-model="appSettingsState.avatarUrl"
                type="url"
              />
            </UFormField>
          </UForm>

          <template #footer>
            <UButton
              type="submit"
              form="appSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </template>
        </UCard>

        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.appearanceSettings') }}</span>
          </template>

          <UForm
            id="appearanceSettingsForm"
            :schema="appearanceSettingsSchema"
            :state="appearanceSettingsState"
            class="space-y-4"
            @submit="onAppearanceSettingsSubmit"
          >
            <UFormField
              name="appearance.theme"
              :label="$t('settings.app.appearance.theme.label')"
              :description="$t('settings.app.appearance.theme.description')"
              required
            >
              <USelectMenu
                v-model="appearanceSettingsState['appearance.theme']"
                :items="themeOptions"
                label-key="label"
                value-key="value"
                placeholder="选择主题"
              />
            </UFormField>
          </UForm>

          <template #footer>
            <UButton
              type="submit"
              form="appearanceSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
