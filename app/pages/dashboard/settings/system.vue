<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.systemSettings'),
})

const {
  fields: rawSystemFields,
  state: systemState,
  submit: submitSystem,
  loading: systemLoading,
} = useSettingsForm('system')

const systemFields = computed(() =>
  rawSystemFields.value.filter((field) => !field.isReadonly),
)

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const getDefaultFieldValue = (field: (typeof rawSystemFields.value)[number]) =>
  field.value ?? field.defaultValue ?? null

const isSystemDirty = computed(() =>
  systemFields.value.some(
    (field) => !sameValue(systemState[field.key], getDefaultFieldValue(field)),
  ),
)

const resetSystemSettings = () => {
  systemFields.value.forEach((field) => {
    systemState[field.key] = getDefaultFieldValue(field)
  })
}

const handleSystemSettingsSubmit = async () => {
  const systemData = Object.fromEntries(
    systemFields.value.map((f) => [f.key, systemState[f.key]]),
  )

  try {
    await submitSystem(systemData)
  } catch {
    /* empty */
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.systemSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section
          class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800"
        >
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {{ $t('title.systemSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            配置系统级行为参数。这里的修改会影响全局上传和服务行为。
          </p>
        </section>

        <section
          class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        >
          <header
            class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <h3
              class="text-base font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {{ $t('title.systemSettings') }}
            </h3>
          </header>

          <div
            v-if="systemLoading && systemFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-10 w-full" />
          </div>

          <UForm
            v-else
            id="systemSettingsForm"
            class="space-y-5 px-5 py-5"
            @submit="handleSystemSettingsSubmit"
          >
            <SettingField
              v-for="field in systemFields"
              :key="field.key"
              :field="field"
              :model-value="systemState[field.key]"
              @update:model-value="(val) => (systemState[field.key] = val)"
            />
          </UForm>

          <footer
            class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div
              v-if="isSystemDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isSystemDirty"
                @click="resetSystemSettings"
              >
                重置
              </UButton>
              <UButton
                :loading="systemLoading"
                type="submit"
                form="systemSettingsForm"
                :disabled="!isSystemDirty"
                icon="tabler:device-floppy"
              >
                保存设置
              </UButton>
            </div>
          </footer>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
