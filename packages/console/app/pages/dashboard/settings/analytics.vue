<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.analyticsSettings'),
})

const {
  fields: analyticsFields,
  state: analyticsState,
  submit: submitAnalytics,
  loading: analyticsLoading,
} = useSettingsForm('analytics')

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const isAnalyticsDirty = computed(() =>
  analyticsFields.value.some(
    (field) =>
      !sameValue(
        analyticsState[field.key],
        field.value ?? field.defaultValue ?? null,
      ),
  ),
)

const resetAnalyticsSettings = () => {
  analyticsFields.value.forEach((field) => {
    analyticsState[field.key] = field.value ?? field.defaultValue ?? null
  })
}

const handleAnalyticsSettingsSubmit = async () => {
  const analyticsData = Object.fromEntries(
    analyticsFields.value.map((f) => [f.key, analyticsState[f.key]]),
  )
  try {
    await submitAnalytics(analyticsData)
  } catch {
    /* empty */
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.analyticsSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section
          class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800"
        >
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {{ $t('title.analyticsSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.analytics.sectionDescription') }}
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
              {{ $t('title.analyticsSettings') }}
            </h3>
          </header>

          <div
            v-if="analyticsLoading && analyticsFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-44" />
            <USkeleton class="h-12 w-full" />
          </div>

          <UForm
            v-else
            id="analyticsSettingsForm"
            class="space-y-5 px-5 py-5 [&_textarea]:font-mono [&_textarea]:text-xs"
            @submit="handleAnalyticsSettingsSubmit"
          >
            <SettingField
              v-for="field in analyticsFields"
              :key="field.key"
              :field="field"
              :model-value="analyticsState[field.key]"
              @update:model-value="(val) => (analyticsState[field.key] = val)"
            />
          </UForm>

          <footer
            class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div
              v-if="isAnalyticsDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isAnalyticsDirty"
                @click="resetAnalyticsSettings"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="analyticsLoading"
                type="submit"
                form="analyticsSettingsForm"
                :disabled="!isAnalyticsDirty"
                icon="tabler:device-floppy"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </footer>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
