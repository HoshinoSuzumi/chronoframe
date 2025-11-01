<script lang="ts" setup>
import type { FormSubmitEvent } from '@nuxt/ui'
import z from 'zod'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.mapAndLocation'),
})

const toast = useToast()

// 获取 schema 信息，用于获取翻译键
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

// 获取当前 map namespace 的所有设置
const { data: mapSettings, refresh: refreshMapSettings } = await useFetch<{
  namespace: string
  settings: Record<string, any>
}>('/api/system/settings/map')

// 获取当前 location namespace 的所有设置
const { data: _locationSettings, refresh: refreshLocationSettings } =
  await useFetch<{
    namespace: string
    settings: Record<string, any>
  }>('/api/system/settings/location')

// 表单 schema
const mapSettingsSchema = z.object({
  provider: z.enum(['mapbox', 'maplibre']),
  'mapbox.token': z.string().optional(),
  'mapbox.style': z.string().optional(),
  'maplibre.token': z.string().optional(),
  'maplibre.style': z.string().optional(),
})

type MapSettingsSchema = z.output<typeof mapSettingsSchema>

// Location 表单 schema
const _locationSettingsSchema = z.object({
  'mapbox.token': z.string().optional(),
  'nominatim.baseUrl': z.string().optional(),
})

type LocationSettingsSchema = z.output<typeof _locationSettingsSchema>

// 初始化表单状态
const mapSettingsState = reactive<Partial<MapSettingsSchema>>({
  provider: 'maplibre',
  'mapbox.token': '',
  'mapbox.style': '',
  'maplibre.token': '',
  'maplibre.style': '',
})

// Location 表单状态
const locationSettingsState = reactive<Partial<LocationSettingsSchema>>({
  'mapbox.token': '',
  'nominatim.baseUrl': '',
})

// 监听 mapSettings 数据加载，初始化表单
watch(
  () => mapSettings.value,
  (settings) => {
    if (settings?.settings && typeof settings.settings === 'object') {
      mapSettingsState.provider =
        (settings.settings.provider as 'mapbox' | 'maplibre') || 'maplibre'
      mapSettingsState['mapbox.token'] = settings.settings['mapbox.token'] || ''
      mapSettingsState['mapbox.style'] = settings.settings['mapbox.style'] || ''
      mapSettingsState['maplibre.token'] =
        settings.settings['maplibre.token'] || ''
      mapSettingsState['maplibre.style'] =
        settings.settings['maplibre.style'] || ''
    }
  },
  { immediate: true },
)

// 监听 locationSettings 数据加载，初始化表单
watch(
  () => _locationSettings.value,
  (settings) => {
    if (settings?.settings && typeof settings.settings === 'object') {
      locationSettingsState['mapbox.token'] =
        settings.settings['mapbox.token'] || ''
      locationSettingsState['nominatim.baseUrl'] =
        settings.settings['nominatim.baseUrl'] || ''
    }
  },
  { immediate: true },
)

// 从 schema 中提取地图相关的翻译信息
const getMapSettingLabel = (key: string): string => {
  const schema = settingsSchema.value?.find(
    (s) => s.namespace === 'map' && s.key === key,
  )
  return schema?.label || `settings.map.${key}.label`
}

const getMapSettingDescription = (key: string): string => {
  const schema = settingsSchema.value?.find(
    (s) => s.namespace === 'map' && s.key === key,
  )
  return schema?.description || `settings.map.${key}.description`
}

// 从 schema 中提取位置相关的翻译信息
const getLocationSettingLabel = (key: string): string => {
  const schema = settingsSchema.value?.find(
    (s) => s.namespace === 'location' && s.key === key,
  )
  return schema?.label || `settings.location.${key}.label`
}

const getLocationSettingDescription = (key: string): string => {
  const schema = settingsSchema.value?.find(
    (s) => s.namespace === 'location' && s.key === key,
  )
  return schema?.description || `settings.location.${key}.description`
}

const onMapSettingsSubmit = async (
  event: FormSubmitEvent<MapSettingsSchema>,
) => {
  try {
    // 并行更新所有设置
    const updatePromises = Object.entries(event.data).map(([key, value]) =>
      $fetch(`/api/system/settings/map/${key}`, {
        method: 'PUT',
        body: { value: value || null },
      }),
    )

    await Promise.all(updatePromises)
    refreshMapSettings()
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

const onLocationSettingsSubmit = async (
  event: FormSubmitEvent<LocationSettingsSchema>,
) => {
  try {
    // 并行更新所有设置
    const updatePromises = Object.entries(event.data).map(([key, value]) =>
      $fetch(`/api/system/settings/location/${key}`, {
        method: 'PUT',
        body: { value: value || null },
      }),
    )

    await Promise.all(updatePromises)
    refreshLocationSettings()
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
      <UDashboardNavbar :title="$t('title.mapAndLocation')" />
    </template>

    <template #body>
      <div class="space-y-6 max-w-6xl">
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.mapAndLocation') }}</span>
          </template>

          <UForm
            id="mapSettingsForm"
            :schema="mapSettingsSchema"
            :state="mapSettingsState"
            class="space-y-4"
            @submit="onMapSettingsSubmit"
          >
            <!-- 地图 Provider 选择 -->
            <UFormField
              :label="$t(getMapSettingLabel('provider'))"
              :description="$t(getMapSettingDescription('provider'))"
            >
              <UTabs
                v-model="mapSettingsState.provider"
                class="w-fit"
                size="sm"
                :items="[
                  { label: 'MapBox', value: 'mapbox' },
                  { label: 'MapLibre', value: 'maplibre' },
                ]"
              />
            </UFormField>

            <!-- Mapbox 配置 -->
            <template v-if="mapSettingsState.provider === 'mapbox'">
              <USeparator />

              <UFormField
                name="mapbox.token"
                :label="$t(getMapSettingLabel('mapbox.token'))"
                :description="$t(getMapSettingDescription('mapbox.token'))"
                required
              >
                <UInput
                  v-model="mapSettingsState['mapbox.token']"
                  type="password"
                  placeholder="pk.xxxxxx"
                />
              </UFormField>

              <UFormField
                name="mapbox.style"
                :label="$t(getMapSettingLabel('mapbox.style'))"
                :description="$t(getMapSettingDescription('mapbox.style'))"
              >
                <UInput
                  v-model="mapSettingsState['mapbox.style']"
                  placeholder="mapbox://styles/mapbox/light-v11"
                />
              </UFormField>
            </template>

            <!-- MapLibre 配置 -->
            <template v-if="mapSettingsState.provider === 'maplibre'">
              <USeparator />

              <UFormField
                name="maplibre.token"
                :label="$t(getMapSettingLabel('maplibre.token'))"
                :description="$t(getMapSettingDescription('maplibre.token'))"
                required
              >
                <UInput
                  v-model="mapSettingsState['maplibre.token']"
                  type="password"
                  placeholder="pk.xxxxxx"
                />
              </UFormField>

              <UFormField
                name="maplibre.style"
                :label="$t(getMapSettingLabel('maplibre.style'))"
                :description="$t(getMapSettingDescription('maplibre.style'))"
              >
                <UInput
                  v-model="mapSettingsState['maplibre.style']"
                  placeholder="https://example.com/style.json"
                />
              </UFormField>
            </template>
          </UForm>

          <template #footer>
            <UButton
              type="submit"
              form="mapSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </template>
        </UCard>

        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.location') }}</span>
          </template>

          <UForm
            id="locationSettingsForm"
            :schema="_locationSettingsSchema"
            :state="locationSettingsState"
            class="space-y-4"
            @submit="onLocationSettingsSubmit"
          >
            <!-- Mapbox Token -->
            <UFormField
              name="mapbox.token"
              :label="$t(getLocationSettingLabel('mapbox.token'))"
              :description="$t(getLocationSettingDescription('mapbox.token'))"
            >
              <UInput
                v-model="locationSettingsState['mapbox.token']"
                type="password"
                placeholder="pk.xxxxxx"
              />
            </UFormField>

            <!-- Nominatim baseUrl -->
            <UFormField
              name="nominatim.baseUrl"
              :label="$t(getLocationSettingLabel('nominatim.baseUrl'))"
              :description="
                $t(getLocationSettingDescription('nominatim.baseUrl'))
              "
            >
              <UInput
                v-model="locationSettingsState['nominatim.baseUrl']"
                placeholder="optional"
              />
            </UFormField>
          </UForm>

          <template #footer>
            <UButton
              type="submit"
              form="locationSettingsForm"
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
