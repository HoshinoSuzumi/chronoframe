<script lang="ts" setup>
import { settingsFieldCommitKey } from '#console/composables/useSettingsForm'
import {
  MAX_SOCIAL_LINKS,
  parseSocialLinks,
  resolveSocialPlatform,
  socialLinkIdentity,
  SocialLinkError,
} from '@chronoframe/contracts/social-links'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: () => $t('title.generalSettings'),
})

const colorMode = useColorMode()

const { fields, state, submit, loading, commitField } = useSettingsForm('app')
const { t } = useI18n()

provide(settingsFieldCommitKey, commitField)

const appFields = computed(() =>
  fields.value.filter(
    (f) => !f.key.startsWith('appearance.') && f.key !== 'socialLinks',
  ),
)

const appearanceFields = computed(() =>
  fields.value.filter((f) => f.key.startsWith('appearance.')),
)

const socialField = computed(() =>
  fields.value.find((field) => field.key === 'socialLinks'),
)
const socialDraft = ref<string[]>(Array(MAX_SOCIAL_LINKS).fill(''))
const socialInitialized = ref(false)
const savedSocialLinks = computed(() => {
  try {
    return parseSocialLinks(socialField.value?.value ?? { links: [] })
  } catch {
    return []
  }
})

watch(socialField, (field) => {
  if (!field || socialInitialized.value) return
  socialDraft.value = Array.from(
    { length: MAX_SOCIAL_LINKS },
    (_, index) => savedSocialLinks.value[index] ?? '',
  )
  socialInitialized.value = true
})

const socialErrors = computed(() => {
  const seen = new Set<string>()
  return socialDraft.value.map((value) => {
    if (!value.trim()) return ''
    try {
      const identity = socialLinkIdentity(value.trim())
      if (seen.has(identity)) return t('settings.app.socialLinks.duplicate')
      seen.add(identity)
      return ''
    } catch {
      return t('settings.app.socialLinks.invalid')
    }
  })
})

const isSocialDirty = computed(
  () =>
    socialInitialized.value &&
    socialDraft.value.some(
      (value, index) => value !== (savedSocialLinks.value[index] ?? ''),
    ),
)

const resetSocialLinks = () => {
  socialDraft.value = Array.from(
    { length: MAX_SOCIAL_LINKS },
    (_, index) => savedSocialLinks.value[index] ?? '',
  )
}

const socialSubmitError = ref('')
const handleSocialLinksSubmit = async () => {
  socialSubmitError.value = ''
  const links = socialDraft.value.map((link) => link.trim()).filter(Boolean)
  try {
    parseSocialLinks({ links })
    await submit({ socialLinks: { links } })
    socialDraft.value = Array.from(
      { length: MAX_SOCIAL_LINKS },
      (_, index) => links[index] ?? '',
    )
  } catch (error) {
    socialSubmitError.value =
      error instanceof SocialLinkError
        ? t(`settings.app.socialLinks.${error.code}`)
        : t('settings.form.saveFailed')
  }
}

const sameValue = (left: any, right: any) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const getDefaultFieldValue = (field: (typeof fields.value)[number]) =>
  field.value ?? field.defaultValue ?? null

const isAppDirty = computed(() =>
  appFields.value.some(
    (field) => !sameValue(state[field.key], getDefaultFieldValue(field)),
  ),
)

const isAppearanceDirty = computed(() =>
  appearanceFields.value.some(
    (field) => !sameValue(state[field.key], getDefaultFieldValue(field)),
  ),
)

const resetAppSettings = () => {
  appFields.value.forEach((field) => {
    state[field.key] = getDefaultFieldValue(field)
  })
}

const resetAppearanceSettings = () => {
  appearanceFields.value.forEach((field) => {
    state[field.key] = getDefaultFieldValue(field)
  })
}

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
        <section
          class="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800"
        >
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {{ $t('title.generalSettings') }}
          </h2>
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            {{ $t('settings.general.description') }}
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
              {{ $t('title.generalSettings') }}
            </h3>
          </header>

          <div
            v-if="loading && appFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-4 w-44" />
            <USkeleton class="h-10 w-full" />
            <USkeleton class="h-4 w-36" />
            <USkeleton class="h-10 w-full" />
          </div>

          <UForm
            v-else
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

          <footer
            class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div
              v-if="isAppDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isAppDirty"
                @click="resetAppSettings"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="loading"
                type="submit"
                form="appSettingsForm"
                :disabled="!isAppDirty"
                icon="tabler:device-floppy"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </footer>
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
              {{ $t('title.appearanceSettings') }}
            </h3>
          </header>

          <div
            v-if="loading && appearanceFields.length === 0"
            class="space-y-4 px-5 py-5"
          >
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-10 w-full" />
          </div>

          <UForm
            v-else
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

          <footer
            class="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800"
          >
            <div
              v-if="isAppearanceDirty"
              class="mb-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/60 dark:bg-warning-950/30 dark:text-warning-200"
            >
              {{ $t('common.unsavedChanges') }}
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="!isAppearanceDirty"
                @click="resetAppearanceSettings"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                :loading="loading"
                type="submit"
                form="appearanceSettingsForm"
                :disabled="!isAppearanceDirty"
                icon="tabler:device-floppy"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </footer>
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
              {{ $t('settings.app.socialLinks.title') }}
            </h3>
            <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {{ $t('settings.app.socialLinks.description') }}
            </p>
          </header>

          <div
            v-if="loading && !socialInitialized"
            class="space-y-3 px-5 py-5"
          >
            <USkeleton
              v-for="index in MAX_SOCIAL_LINKS"
              :key="index"
              class="h-10 w-full"
            />
          </div>
          <form
            v-else
            class="space-y-4 px-5 py-5"
            @submit.prevent="handleSocialLinksSubmit"
          >
            <div
              v-for="(_, index) in socialDraft"
              :key="index"
              class="flex items-start gap-3"
            >
              <Icon
                :name="resolveSocialPlatform(socialDraft[index] || '').icon"
                class="mt-2.5 shrink-0 text-xl text-neutral-500 dark:text-neutral-400"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <label
                  :for="`social-link-${index}`"
                  class="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  {{
                    $t('settings.app.socialLinks.slot', { number: index + 1 })
                  }}
                </label>
                <UInput
                  :id="`social-link-${index}`"
                  v-model="socialDraft[index]"
                  type="url"
                  class="w-full"
                  :placeholder="$t('settings.app.socialLinks.placeholder')"
                  :aria-invalid="Boolean(socialErrors[index])"
                  :aria-describedby="
                    socialErrors[index]
                      ? `social-link-error-${index}`
                      : undefined
                  "
                />
                <p
                  v-if="socialErrors[index]"
                  :id="`social-link-error-${index}`"
                  class="mt-1 text-sm text-error-600 dark:text-error-400"
                >
                  {{ socialErrors[index] }}
                </p>
              </div>
              <UButton
                v-if="socialDraft[index]"
                type="button"
                color="neutral"
                variant="ghost"
                icon="tabler:x"
                :aria-label="
                  $t('settings.app.socialLinks.clear', { number: index + 1 })
                "
                class="mt-6"
                @click="socialDraft[index] = ''"
              />
            </div>

            <p
              v-if="socialSubmitError"
              role="alert"
              class="text-sm text-error-600 dark:text-error-400"
            >
              {{ socialSubmitError }}
            </p>
            <div
              class="flex items-center justify-end gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800"
            >
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                :disabled="!isSocialDirty || loading"
                @click="resetSocialLinks"
              >
                {{ $t('common.actions.reset') }}
              </UButton>
              <UButton
                type="submit"
                icon="tabler:device-floppy"
                :loading="loading"
                :disabled="!isSocialDirty || socialErrors.some(Boolean)"
              >
                {{ $t('common.actions.saveSettings') }}
              </UButton>
            </div>
          </form>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped></style>
