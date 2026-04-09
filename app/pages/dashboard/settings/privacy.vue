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
      <div class="space-y-6 max-w-6xl">
        <UCard variant="outline">
          <template #header>
            <span>{{ $t('title.privacySettings') }}</span>
          </template>

          <UForm
            id="privacySettingsForm"
            class="space-y-4"
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

          <template #footer>
            <UButton
              :loading="privacyLoading"
              type="submit"
              form="privacySettingsForm"
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
