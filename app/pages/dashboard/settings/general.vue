<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.generalSettings'),
})

const colorMode = useColorMode()
const toast = useToast()

// 使用新的 Settings Form Composable
const { fields, state, submit, loading, error } = useSettingsForm('app')

// 分离通用和外观设置
const appFields = computed(() =>
  fields.value.filter(f => !f.key.startsWith('appearance.')),
)

const appearanceFields = computed(() =>
  fields.value.filter(f => f.key.startsWith('appearance.')),
)

// 处理通用设置提交
const handleAppSettingsSubmit = async () => {
  const appData = Object.fromEntries(
    appFields.value.map(f => [f.key, state[f.key]]),
  )
  try {
    await submit(appData)
    toast.add({
      title: '通用设置已保存',
      color: 'success',
    })
  } catch {
    toast.add({
      title: '保存通用设置失败',
      description: error.value || '未知错误',
      color: 'error',
    })
  }
}

// 处理外观设置提交
const handleAppearanceSettingsSubmit = async () => {
  const appearanceData = Object.fromEntries(
    appearanceFields.value.map(f => [f.key, state[f.key]]),
  )
  try {
    await submit(appearanceData)
    if (state['appearance.theme']) {
      colorMode.preference = state['appearance.theme']
    }
    toast.add({
      title: '外观设置已保存',
      color: 'success',
    })
  } catch {
    toast.add({
      title: '保存外观设置失败',
      description: error.value || '未知错误',
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
        <!-- 通用设置 -->
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.generalSettings') }}</span>
          </template>

          <UForm
            id="appSettingsForm"
            class="space-y-4"
            @submit="handleAppSettingsSubmit"
          >
            <SettingField
              v-for="field in appFields"
              :key="field.key"
              :field="field"
              :model-value="state[field.key]"
              @update:model-value="(val) => (state[field.key] = val)"
            />
          </UForm>

          <template #footer>
            <UButton
              :loading="loading"
              type="submit"
              form="appSettingsForm"
              variant="soft"
              icon="tabler:device-floppy"
            >
              保存设置
            </UButton>
          </template>
        </UCard>

        <!-- 外观设置 -->
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.appearanceSettings') }}</span>
          </template>

          <UForm
            id="appearanceSettingsForm"
            class="space-y-4"
            @submit="handleAppearanceSettingsSubmit"
          >
            <SettingField
              v-for="field in appearanceFields"
              :key="field.key"
              :field="field"
              :model-value="state[field.key]"
              @update:model-value="(val) => (state[field.key] = val)"
            />
          </UForm>

          <template #footer>
            <UButton
              :loading="loading"
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
