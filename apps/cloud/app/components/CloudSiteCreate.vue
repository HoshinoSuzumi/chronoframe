<script setup lang="ts">
const { t } = useI18n()

import { Plus, ArrowRight, Layers } from 'lucide-vue-next'
defineProps<{ workspaceName?: string }>()
const open = ref(false)
const name = ref('')
const slug = ref('')
const busy = ref(false)
const error = ref('')
let requestId = ''
watch([name, slug], () => {
  requestId = ''
  error.value = ''
})
const validSlug = computed(() =>
  /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug.value),
)
async function show() {
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
  if (busy.value) return
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
    ><CloudButton
      v-if="!open"
      id="create-site-trigger"
      size="sm"
      @click="show"
      ><Plus :size="15" />{{ $t('cloud.messages.createSite') }}</CloudButton
    >
  </div>
  <CloudCard
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
        <div class="cf-field">
          <label for="site-name">{{ $t('cloud.messages.siteName') }}</label
          ><CloudInput
            id="site-name"
            v-model="name"
            required
            maxlength="80"
            autocomplete="off"
            :disabled="busy"
          />
        </div>
        <div class="cf-field">
          <label for="site-slug">{{ $t('cloud.messages.siteAddress') }}</label
          ><CloudInput
            id="site-slug"
            v-model="slug"
            required
            minlength="3"
            maxlength="40"
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            aria-describedby="site-address-help site-address-preview"
            :disabled="busy"
          />
        </div>
      </div>
      <p
        id="site-address-preview"
        class="cf-address-preview"
      >
        {{ slug || 'your-site' }}.site.chronoframe.art
      </p>
      <p
        id="site-address-help"
        class="cf-field-hint"
      >
        {{ $t('cloud.messages.use340LowercaseLettersNumbersOrHyphensSome') }}
      </p>
      <p
        v-if="error"
        role="alert"
        class="cf-notice"
      >
        {{ error }}
      </p>
      <div class="cf-site-actions">
        <CloudButton
          type="submit"
          :disabled="busy || !name.trim() || !validSlug"
          >{{
            busy
              ? $t('cloud.messages.creating')
              : $t('cloud.messages.createDraft')
          }}<ArrowRight :size="14" /></CloudButton
        ><CloudButton
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="cancel"
          >{{ $t('cloud.messages.cancel') }}</CloudButton
        >
      </div>
    </form>
  </CloudCard>
</template>
