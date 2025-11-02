<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.mapAndLocation'),
})

const {
  fields: mapFields,
  state: mapState,
  submit: submitMap,
  loading: mapLoading,
} = useSettingsForm('map')
const {
  fields: locationFields,
  state: locationState,
  submit: submitLocation,
  loading: locationLoading,
} = useSettingsForm('location')

const visibleMapFields = computed(() => {
  const provider = mapState.provider
  return mapFields.value.filter((field) => {
    if (!field.ui.visibleIf) return true
    if (field.ui.visibleIf.fieldKey === 'provider') {
      return field.ui.visibleIf.value === provider
    }
    return true
  })
})

const handleMapSettingsSubmit = async () => {
  const mapData = Object.fromEntries(
    visibleMapFields.value.map((f) => [f.key, mapState[f.key]]),
  )
  try {
    await submitMap(mapData)
  } catch {
    /* empty */
  }
}

const handleLocationSettingsSubmit = async () => {
  const locationData = Object.fromEntries(
    locationFields.value.map((f) => [f.key, locationState[f.key]]),
  )
  try {
    await submitLocation(locationData)
  } catch {
    /* empty */
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
