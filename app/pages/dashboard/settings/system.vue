<script lang="ts" setup>
import type { FieldDescriptor } from '~~/shared/types/settings'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.systemSettings'),
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

type SystemSection = {
  id: string
  titleKey: string
  keys: string[]
}

type SystemSectionWithFields = SystemSection & {
  fields: FieldDescriptor[]
}

const SYSTEM_SECTION_ORDER: SystemSection[] = [
  {
    id: 'thirdPartyLogin',
    titleKey: 'settings.system.sections.thirdPartyLogin',
    keys: [
      'auth.github.enabled',
      'auth.github.clientId',
      'auth.github.clientSecret',
    ],
  },
  {
    id: 'fileProcessing',
    titleKey: 'settings.system.sections.fileProcessing',
    keys: [
      'upload.maxFileSize',
      'queue.workerCount',
      'upload.duplicateCheck.enabled',
      'upload.duplicateCheck.mode',
    ],
  },
  {
    id: 'debug',
    titleKey: 'settings.system.sections.debugSettings',
    keys: ['webglImageViewerDebug'],
  },
] as const

const isFieldDescriptor = (
  field: FieldDescriptor | undefined,
): field is FieldDescriptor => Boolean(field)

const systemFieldSections = computed<SystemSectionWithFields[]>(() =>
  SYSTEM_SECTION_ORDER.map((section) => ({
    ...section,
    fields: section.keys
      .map((key) => systemFields.value.find((field) => field.key === key))
      .filter(isFieldDescriptor),
  })).filter((section) => section.fields.length > 0),
)

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const getDefaultFieldValue = (field: (typeof rawSystemFields.value)[number]) =>
  field.value ?? field.defaultValue ?? null

const getSectionFormId = (sectionId: string) =>
  `systemSettingsForm-${sectionId}`

const isSectionDirty = (section: SystemSectionWithFields) =>
  section.fields.some(
    (field) => !sameValue(systemState[field.key], getDefaultFieldValue(field)),
  )

const resetSectionSettings = (section: SystemSectionWithFields) => {
  section.fields.forEach((field) => {
    systemState[field.key] = getDefaultFieldValue(field)
  })
}

const handleSectionSettingsSubmit = async (
  section: SystemSectionWithFields,
) => {
  const systemData = Object.fromEntries(
    section.fields.map((f) => [f.key, systemState[f.key]]),
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
            {{ $t('settings.system.sectionDescription') }}
          </p>
        </section>

        <TourControls />
        <template v-if="systemLoading && systemFieldSections.length === 0">
          <section
            v-for="index in 3"
            :key="index"
            class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
          >
            <header
              class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
            >
              <USkeleton class="h-5 w-32" />
            </header>
            <div class="space-y-4 px-5 py-5">
              <USkeleton class="h-4 w-40" />
              <USkeleton class="h-10 w-full" />
            </div>
          </section>
        </template>

        <section
          v-for="section in systemFieldSections"
          :key="section.id"
          class="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        >
          <header
            class="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <h3
              class="text-base font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {{ $t(section.titleKey) }}
            </h3>
          </header>

          <UForm
            :id="getSectionFormId(section.id)"
            class="space-y-5 px-5 py-5"
            @submit="handleSectionSettingsSubmit(section)"
          >
            <SettingField
              v-for="field in section.fields"
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
              v-if="isSectionDirty(section)"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isSectionDirty(section)"
                @click="resetSectionSettings(section)"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="systemLoading"
                type="submit"
                :form="getSectionFormId(section.id)"
                :disabled="!isSectionDirty(section)"
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
