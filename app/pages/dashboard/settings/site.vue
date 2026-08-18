<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.siteSettings'),
})

const {
  fields: siteFields,
  state: siteState,
  submit: submitSite,
  loading: siteLoading,
} = useSettingsForm('site')

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const isSiteDirty = computed(() =>
  siteFields.value.some(
    (field) =>
      !sameValue(
        siteState[field.key],
        field.value ?? field.defaultValue ?? null,
      ),
  ),
)

const resetSiteSettings = () => {
  siteFields.value.forEach((field) => {
    siteState[field.key] = field.value ?? field.defaultValue ?? null
  })
}

const handleSiteSettingsSubmit = async () => {
  const siteData = Object.fromEntries(
    siteFields.value.map((f) => [f.key, siteState[f.key]]),
  )
  try {
    await submitSite(siteData)
  } catch {
    /* empty */
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.siteSettings')" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <section
          class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800"
        >
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {{ $t('title.siteSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.site.sectionDescription') }}
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
              {{ $t('title.siteSettings') }}
            </h3>
          </header>

          <div
            v-if="siteLoading && siteFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-44" />
            <USkeleton class="h-12 w-full" />
          </div>

          <UForm
            v-else
            id="siteSettingsForm"
            class="space-y-5 px-5 py-5 [&_textarea]:font-mono [&_textarea]:text-xs"
            @submit="handleSiteSettingsSubmit"
          >
            <SettingField
              v-for="field in siteFields"
              :key="field.key"
              :field="field"
              :model-value="siteState[field.key]"
              @update:model-value="(val) => (siteState[field.key] = val)"
            />
          </UForm>

          <footer
            class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div
              v-if="isSiteDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isSiteDirty"
                @click="resetSiteSettings"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="siteLoading"
                type="submit"
                form="siteSettingsForm"
                :disabled="!isSiteDirty"
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
