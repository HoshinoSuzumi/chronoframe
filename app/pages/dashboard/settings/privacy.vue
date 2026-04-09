<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.privacySettings'),
})

const {
  fields: privacyFields,
  state: privacyState,
  submit: submitPrivacy,
  loading: privacyLoading,
} = useSettingsForm('privacy')

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const isPrivacyDirty = computed(() =>
  privacyFields.value.some(
    (field) =>
      !sameValue(
        privacyState[field.key],
        field.value ?? field.defaultValue ?? null,
      ),
  ),
)

const resetPrivacySettings = () => {
  privacyFields.value.forEach((field) => {
    privacyState[field.key] = field.value ?? field.defaultValue ?? null
  })
}

const handlePrivacySettingsSubmit = async () => {
  const privacyData = Object.fromEntries(
    privacyFields.value.map((f) => [f.key, privacyState[f.key]]),
  )

  try {
    await submitPrivacy(privacyData)
  } catch {
    /* empty */
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.privacySettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h2 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {{ $t('title.privacySettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            管理照片上传时的数据隐私策略。建议在公开站点启用位置信息抹除。
          </p>
        </section>

        <section class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <header class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {{ $t('title.privacySettings') }}
            </h3>
          </header>

          <div
            v-if="privacyLoading && privacyFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-44" />
            <USkeleton class="h-12 w-full" />
          </div>

          <UForm
            v-else
            id="privacySettingsForm"
            class="space-y-5 px-5 py-5"
            @submit="handlePrivacySettingsSubmit"
          >
            <SettingField
              v-for="field in privacyFields"
              :key="field.key"
              :field="field"
              :model-value="privacyState[field.key]"
              @update:model-value="(val) => (privacyState[field.key] = val)"
            />
          </UForm>

          <footer class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            <div
              v-if="isPrivacyDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isPrivacyDirty"
                @click="resetPrivacySettings"
              >
                重置
              </UButton>
            <UButton
              :loading="privacyLoading"
              type="submit"
              form="privacySettingsForm"
              :disabled="!isPrivacyDirty"
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
