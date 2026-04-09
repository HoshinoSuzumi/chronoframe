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
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.mapAndLocation') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            配置地图展示与地理编码服务。地图服务商会影响地图样式与访问凭证。
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.mapAndLocation') }}
            </h3>
          </header>

          <UForm
            id="mapSettingsForm"
            class="space-y-5 px-5 py-5"
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

          <footer class="flex justify-end border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <UButton
              :loading="mapLoading"
              type="submit"
              form="mapSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </footer>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.location') }}
            </h3>
          </header>

          <UForm
            id="locationSettingsForm"
            class="space-y-5 px-5 py-5"
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

          <footer class="flex justify-end border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <UButton
              :loading="locationLoading"
              type="submit"
              form="locationSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </footer>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
