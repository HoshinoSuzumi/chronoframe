<script setup lang="ts">
const { t } = useI18n()
const siteBaseDomain = useRuntimeConfig().public.siteBaseDomain

import { Plus, ArrowRight, Layers } from 'lucide-vue-next'
const props = defineProps<{ workspaceName?: string; workspaceId?: number }>()
const quota = useCloudQuota(() => props.workspaceId)
const admission = computed(() => quota.gate('sites'))
const checking = ref(false)
const open = ref(false)
const quotaOpen = ref(false)
const name = ref('')
const slug = ref('')
const busy = ref(false)
const error = ref('')
function focusTrigger() {
  if (!open.value) document.getElementById('create-site-trigger')?.focus()
}
let requestId = ''
watch([name, slug], () => {
  requestId = ''
  error.value = ''
})
const validSlug = computed(() =>
  /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug.value),
)
async function show() {
  checking.value = true
  await quota.refresh()
  checking.value = false
  if (!admission.value.allowed || quota.error.value) {
    quotaOpen.value = true
    return
  }
  quotaOpen.value = false
  open.value = true
  await nextTick()
  document.getElementById('site-name')?.focus()
}
async function cancel() {
  open.value = false
  await nextTick()
  document.getElementById('create-site-trigger')?.focus()
}
async function create() {
  if (busy.value || !admission.value.allowed || quota.error.value) return
  busy.value = true
  error.value = ''
  requestId ||= crypto.randomUUID()
  try {
    const result = await $fetch<{ site: { siteId: number } }>('/api/sites', {
      method: 'POST',
      body: { name: name.value, slug: slug.value, requestId },
    })
    await navigateTo(`/sites/${result.site.siteId}`)
  } catch (cause) {
    const status = (cause as { statusCode?: number }).statusCode
    if (status === 403) await quota.refresh()
    error.value =
      status === 409
        ? t('cloud.messages.thisAddressIsAlreadyTakenOrThisRequestChanged')
        : status === 400
          ? t('cloud.messages.checkTheSiteNameAndAddressThisAddressMay')
          : status === 403
            ? t('cloud.messages.youCannotCreateAnotherSiteInThisWorkspaceThe')
            : t('cloud.messages.yourSiteCouldNotBeCreatedPleaseTryAgain')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="cf-workspace-toolbar">
    <span
      ><Layers :size="15" />{{
        workspaceName || $t('cloud.messages.myWorkspace')
      }}</span
    ><CfButton
      v-if="!open"
      id="create-site-trigger"
      size="sm"
      :disabled="checking"
      :loading="checking"
      @click="show"
      ><Plus :size="15" />{{ $t('cloud.messages.createSite') }}</CfButton
    >
  </div>
  <UModal
    v-model:open="quotaOpen"
    :title="$t('cloud.messages.createASite')"
    @after:leave="focusTrigger"
  >
    <template #body>
      <CloudQuotaNotice
        :reason="admission.reason"
        :error="!!quota.error.value"
        @retry="show"
      />
    </template>
    <template #footer>
      <CfButton
        variant="secondary"
        @click="quotaOpen = false"
      >
        {{ $t('cloud.messages.cancel') }}
      </CfButton>
    </template>
  </UModal>
  <CfCard
    v-if="open"
    class="cf-create-panel"
  >
    <div class="cf-panel-heading">
      <h2>{{ $t('cloud.messages.createASite') }}</h2>
      <p>
        {{ $t('cloud.messages.startWithAPrivateDraftYourAddressIsReserved') }}
      </p>
    </div>
    <form
      class="cf-form"
      @submit.prevent="create"
    >
      <div class="cf-create-fields">
        <UFormField
          :label="$t('cloud.messages.siteName')"
          name="name"
        >
          <CfInput
            id="site-name"
            v-model="name"
            :placeholder="$t('cloud.messages.siteNamePlaceholder')"
            required
            maxlength="80"
            autocomplete="off"
            :disabled="busy"
          />
        </UFormField>
        <UFormField
          :label="$t('cloud.messages.siteAddress')"
          :help="
            $t('cloud.messages.use340LowercaseLettersNumbersOrHyphensSome', {
              domain: siteBaseDomain,
            })
          "
          name="slug"
        >
          <UInput
            id="site-slug"
            v-model="slug"
            class="w-full"
            :style="{ '--site-domain-width': `${siteBaseDomain.length + 1}ch` }"
            :ui="{
              base: 'font-mono pe-[calc(var(--site-domain-width)+1.5rem)]',
              trailing: 'pointer-events-none',
            }"
            placeholder="your-site"
            required
            minlength="3"
            maxlength="40"
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            :disabled="busy"
          >
            <template #trailing>
              <span class="font-mono text-sm text-muted"
                >.{{ siteBaseDomain }}</span
              >
            </template>
          </UInput>
        </UFormField>
      </div>
      <p
        v-if="error"
        role="alert"
        class="cf-notice"
      >
        {{ error }}
      </p>
      <div class="cf-site-actions">
        <CfButton
          type="submit"
          :disabled="
            busy ||
            !name.trim() ||
            !validSlug ||
            !admission.allowed ||
            !!quota.error.value
          "
          >{{
            busy
              ? $t('cloud.messages.creating')
              : $t('cloud.messages.createDraft')
          }}<ArrowRight :size="14" /></CfButton
        ><CfButton
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="cancel"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        >
      </div>
    </form>
  </CfCard>
</template>
