<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.generalSettings'),
})

const colorMode = useColorMode()

const { fields, state, submit, loading } = useSettingsForm('app')

const appFields = computed(() =>
  fields.value.filter((f) => !f.key.startsWith('appearance.')),
)

const appearanceFields = computed(() =>
  fields.value.filter((f) => f.key.startsWith('appearance.')),
)

const handleAppSettingsSubmit = async () => {
  const appData = Object.fromEntries(
    appFields.value.map((f) => [f.key, state[f.key]]),
  )
  try {
    await submit(appData)
  } catch {
    /* empty */
  }
}

const handleAppearanceSettingsSubmit = async () => {
  const appearanceData = Object.fromEntries(
    appearanceFields.value.map((f) => [f.key, state[f.key]]),
  )
  try {
    await submit(appearanceData)
    if (state['appearance.theme']) {
      colorMode.preference = state['appearance.theme']
    }
  } catch {
    /* empty */
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.generalSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.generalSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            管理站点基础信息与展示外观。更改会立即影响控制台和前台展示。
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.generalSettings') }}
            </h3>
          </header>

          <UForm
            id="appSettingsForm"
            class="space-y-5 px-5 py-5"
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

          <footer class="flex justify-end border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <UButton
              :loading="loading"
              type="submit"
              form="appSettingsForm"
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
              {{ $t('title.appearanceSettings') }}
            </h3>
          </header>

          <UForm
            id="appearanceSettingsForm"
            class="space-y-5 px-5 py-5"
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

          <footer class="flex justify-end border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <UButton
              :loading="loading"
              type="submit"
              form="appearanceSettingsForm"
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
