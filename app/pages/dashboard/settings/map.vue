<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.mapAndLocation'),
})

const toast = useToast()

// 使用新的 Settings Form Composable
const { fields: mapFields, state: mapState, submit: submitMap, loading: mapLoading, error: mapError } = useSettingsForm('map')
const { fields: locationFields, state: locationState, submit: submitLocation, loading: locationLoading, error: locationError } = useSettingsForm('location')

// 过滤可见的地图字段（基于 provider）
const visibleMapFields = computed(() => {
  const provider = mapState.provider
  return mapFields.value.filter((field) => {
    if (!field.ui.visibleIf) return true
    // 检查条件字段是否应该显示
    if (field.ui.visibleIf.fieldKey === 'provider') {
      return field.ui.visibleIf.value === provider
    }
    return true
  })
})

// 处理地图设置提交
const handleMapSettingsSubmit = async () => {
  const mapData = Object.fromEntries(
    visibleMapFields.value.map(f => [f.key, mapState[f.key]]),
  )
  try {
    await submitMap(mapData)
    toast.add({
      title: '地图设置已保存',
      color: 'success',
    })
  } catch {
    toast.add({
      title: '保存地图设置失败',
      description: mapError.value || '未知错误',
      color: 'error',
    })
  }
}

// 处理位置设置提交
const handleLocationSettingsSubmit = async () => {
  const locationData = Object.fromEntries(
    locationFields.value.map(f => [f.key, locationState[f.key]]),
  )
  try {
    await submitLocation(locationData)
    toast.add({
      title: '位置设置已保存',
      color: 'success',
    })
  } catch {
    toast.add({
      title: '保存位置设置失败',
      description: locationError.value || '未知错误',
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
        <!-- 地图设置 -->
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.mapAndLocation') }}</span>
          </template>

          <UForm
            id="mapSettingsForm"
            class="space-y-4"
            @submit="handleMapSettingsSubmit"
          >
            <SettingField
              v-for="field in visibleMapFields"
              :key="field.key"
              :field="field"
              :model-value="mapState[field.key]"
              @update:model-value="(val) => (mapState[field.key] = val)"
            />
          </UForm>

          <template #footer>
            <UButton
              :loading="mapLoading"
              type="submit"
              form="mapSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </template>
        </UCard>

        <!-- 位置设置 -->
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.location') }}</span>
          </template>

          <UForm
            id="locationSettingsForm"
            class="space-y-4"
            @submit="handleLocationSettingsSubmit"
          >
            <SettingField
              v-for="field in locationFields"
              :key="field.key"
              :field="field"
              :model-value="locationState[field.key]"
              @update:model-value="(val) => (locationState[field.key] = val)"
            />
          </UForm>

          <template #footer>
            <UButton
              :loading="locationLoading"
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
