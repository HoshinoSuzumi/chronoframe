<script setup lang="ts">
import type {
  EntrySiteCatalog,
  EntrySiteSummary,
} from '@chronoframe/contracts/entry'
import type { AccountSetup } from '@chronoframe/contracts/platform-setup'
import { validSiteSlug } from '@chronoframe/contracts/domains'
const { t } = useI18n()
const fetcher = useRequestFetch()
const user = usePortalIdentity()
const state = shallowRef<AccountSetup | null>(null)
let generation = 0
const currentAccount = () => user.value?.id
const isCurrent = (id: string | number | undefined, request: number) =>
  currentAccount() === id && generation === request
const siteCatalog = useState<EntrySiteCatalog | null>(
  'platform-site-catalog',
  () => null,
)
const busy = ref(false),
  loading = ref(true),
  error = ref('')
const step = ref(1),
  reached = ref(1),
  name = ref(''),
  workspace = ref(''),
  siteName = ref(''),
  slug = ref('')
const workspaceEdited = ref(false)
const siteEdited = ref(false)
const config = useRuntimeConfig()
const open = computed(() => state.value?.required === true)
const labels = computed(() => [
  t('cloud.setup.accountStep'),
  t('cloud.setup.workspaceStep'),
  t('cloud.setup.siteStep'),
])
/** Build an editable default without exceeding workspace-name limits. */
function defaultWorkspace(value: string) {
  const suffix = t('cloud.setup.workspaceSuffix')
  return value.slice(0, 80 - suffix.length) + suffix
}
watch(name, (value) => {
  if (!workspaceEdited.value) workspace.value = defaultWorkspace(value)
  if (!siteEdited.value)
    siteName.value = t('cloud.setup.defaultSiteName', {
      name: value.slice(0, 60),
    })
})
/** Reload setup for the current identity and reject obsolete responses. */
async function refresh() {
  const account = currentAccount()
  const request = ++generation
  if (!account) return
  loading.value = true
  error.value = ''
  try {
    const result = await fetcher<AccountSetup>('/api/onboarding')
    if (!isCurrent(account, request)) return
    state.value = result
    step.value = result.step
    reached.value = result.step
    name.value = result.name
    workspaceEdited.value = !!result.workspace
    siteEdited.value = !!result.site
    workspace.value = result.workspace?.name ?? defaultWorkspace(result.name)
    siteName.value =
      result.site?.name ??
      t('cloud.setup.defaultSiteName', { name: result.name.slice(0, 60) })
    slug.value =
      result.site?.slug ?? 'gallery-' + crypto.randomUUID().slice(0, 8)
  } catch {
    if (isCurrent(account, request)) error.value = t('cloud.setup.loadFailed')
  } finally {
    if (isCurrent(account, request)) loading.value = false
  }
}
onMounted(() => {
  watch(
    currentAccount,
    () => {
      generation++
      state.value = null
      busy.value = false
      error.value = ''
      workspaceEdited.value = false
      siteEdited.value = false
      if (currentAccount()) void refresh()
    },
    { immediate: true, flush: 'sync' },
  )
})
onBeforeUnmount(() => {
  generation++
})
const valid = computed(() =>
  step.value === 1
    ? !!name.value.trim() && name.value.trim().length <= 80
    : step.value === 2
      ? !!workspace.value.trim() && workspace.value.trim().length <= 80
      : !!siteName.value.trim() &&
        siteName.value.trim().length <= 80 &&
        validSiteSlug(slug.value),
)
/** Persist a step and navigate only while its originating account is current. */
async function save(skip = false) {
  if (busy.value || !state.value || (!skip && !valid.value)) return
  busy.value = true
  error.value = ''
  const current = step.value
  const account = currentAccount()
  const request = ++generation
  try {
    const result = await $fetch<AccountSetup>('/api/onboarding', {
      method: 'POST',
      body: {
        step: current,
        revision: state.value.revision,
        name:
          current === 1
            ? name.value
            : current === 2
              ? workspace.value
              : siteName.value,
        slug: slug.value,
        skip,
      },
    })
    if (!isCurrent(account, request)) return
    state.value = result
    if (current === 1 && user.value)
      user.value = { ...user.value, name: name.value.trim() }
    if (result.required) {
      step.value = Math.min(3, current + 1)
      reached.value = Math.max(reached.value, step.value)
    } else {
      await refreshNuxtData(
        (key) =>
          key.startsWith('workspace-billing-') || key.startsWith('quota-'),
      )
      if (!isCurrent(account, request)) return
      const catalog = await $fetch<{ sites: EntrySiteSummary[] }>(
        '/api/sites',
      ).catch(() => null)
      if (!isCurrent(account, request)) return
      if (catalog && user.value)
        siteCatalog.value = { userId: user.value.id, sites: catalog.sites }
      if (result.site) await navigateTo(`/sites/${result.site.siteId}/overview`)
    }
  } catch (cause: unknown) {
    if (!isCurrent(account, request)) return
    const status =
      typeof cause === 'object' && cause && 'statusCode' in cause
        ? cause.statusCode
        : 0
    if (status === 409) {
      busy.value = false
      await refresh()
      if (currentAccount() === account) error.value = t('cloud.setup.conflict')
    } else error.value = t('cloud.setup.saveFailed')
  } finally {
    if (isCurrent(account, request)) busy.value = false
  }
}
</script>
<template>
  <CfAlert
    v-if="error && !open"
    tone="error"
    >{{ error
    }}<template #actions
      ><CfButton
        size="sm"
        variant="secondary"
        :disabled="loading"
        @click="refresh"
        >{{ t('cloud.messages.retry') }}</CfButton
      ></template
    ></CfAlert
  >
  <UModal
    :open="open"
    :dismissible="false"
    :close="false"
    :title="t('cloud.setup.title')"
    :description="t('cloud.setup.description')"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <CfStepper
        v-model="step"
        :steps="labels"
        :reached="reached"
        :disabled="busy"
        :label="t('cloud.setup.title')"
      >
        <form
          :id="'account-setup-step-' + step"
          class="cloud-setup-form"
          @submit.prevent="save()"
        >
          <label
            v-if="step === 1"
            for="setup-name"
            >{{ t('cloud.setup.name')
            }}<CfInput
              id="setup-name"
              v-model="name"
              autocomplete="nickname"
              maxlength="80"
              :disabled="busy"
              required
          /></label>
          <label
            v-if="step === 2"
            for="setup-workspace"
            >{{ t('cloud.setup.workspaceName')
            }}<CfInput
              id="setup-workspace"
              v-model="workspace"
              maxlength="80"
              :disabled="busy"
              required
              @input="workspaceEdited = true"
          /></label>
          <template v-if="step === 3">
            <label for="setup-site-name"
              >{{ t('cloud.setup.siteName')
              }}<CfInput
                id="setup-site-name"
                v-model="siteName"
                @input="siteEdited = true"
                maxlength="80"
                :disabled="busy"
                required
            /></label>
            <label for="setup-site-slug"
              >{{ t('cloud.setup.siteSlug')
              }}<CfInput
                id="setup-site-slug"
                v-model="slug"
                maxlength="40"
                :disabled="busy"
                spellcheck="false"
                autocapitalize="none"
                autocomplete="off"
                :aria-invalid="!validSiteSlug(slug)"
                aria-describedby="setup-slug-hint"
                required
            /></label>
            <p
              id="setup-slug-hint"
              class="cf-field-hint"
            >
              {{ t('cloud.setup.slugHelp') }}
            </p>
            <p class="cloud-setup-address">
              https://{{ slug }}.{{ config.public.siteBaseDomain }}
            </p>
          </template>
        </form>
        <template #footer>
          <p
            v-if="error"
            role="alert"
            class="cf-field-error"
          >
            {{ error }}
          </p>
          <div class="cloud-setup-footer">
            <CfButton
              v-if="step > 1"
              variant="secondary"
              :disabled="busy"
              @click="step--"
              >{{ t('cloud.setup.back') }}</CfButton
            >
            <CfButton
              v-if="step === 3"
              variant="ghost"
              :disabled="busy"
              @click="save(true)"
              >{{ t('cloud.setup.skipSite') }}</CfButton
            >
            <CfButton
              type="submit"
              :form="'account-setup-step-' + step"
              :disabled="!valid || busy"
              :loading="busy"
              >{{
                step === 3
                  ? t('cloud.setup.complete')
                  : t('cloud.setup.continue')
              }}</CfButton
            >
          </div>
        </template>
      </CfStepper>
    </template>
  </UModal>
</template>
<style scoped>
.cloud-setup-form {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.cloud-setup-form label {
  display: grid;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}
.cloud-setup-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.cloud-setup-address {
  font-size: 12px;
  overflow-wrap: anywhere;
  color: var(--muted-foreground);
}
</style>
