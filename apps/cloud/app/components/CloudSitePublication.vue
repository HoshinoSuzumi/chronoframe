<script setup lang="ts">
import type { DomainOverview } from '@chronoframe/contracts/domains'
import { ArrowUpRight, Globe, Copy, Check } from 'lucide-vue-next'
const defaultDomainsReady =
  String(useRuntimeConfig().public.defaultDomainsReady) === 'true'
const activeContext = useEntryContext()
const context = shallowRef(activeContext.value)
// Preserve the outgoing header, while accepting live updates for this Site only.
watch(activeContext, (next) => {
  if (next?.scope === context.value?.scope) context.value = next
})
const { admin, busy, failed, message, publish } = useCloudSiteMedia()
const { data, status, error, refresh } = useFetch<{
  site: {
    slug: string | null
    defaultHostname?: string | null
    legacyHostname?: string | null
  }
}>(`/api/sites/${context.value?.siteId}/settings`)
const {
  data: domainOverview,
  error: domainError,
  refresh: refreshDomains,
} = useFetch<DomainOverview>(`/api/sites/${context.value?.siteId}/domains`)
const customHost = computed(() => {
  if (!domainOverview.value?.enabled || !domainOverview.value.routingReady)
    return undefined
  const eligible =
    domainOverview.value?.domains.filter(
      (d) => d.status === 'active' && !d.holdReason && !d.cleanupPending,
    ) ?? []
  return eligible.find((d) => d.primary)?.hostname
})
const host = computed(
  () =>
    customHost.value ??
    (defaultDomainsReady
      ? (data.value?.site.defaultHostname ?? '')
      : (data.value?.site.legacyHostname ?? '')),
)
const address = computed(() => (host.value ? `https://${host.value}` : ''))
const copied = ref(false),
  copyError = ref(false),
  unpublishOpen = ref(false),
  unpublishError = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))
async function copyAddress() {
  copied.value = false
  copyError.value = false
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch {
    copyError.value = true
  }
}
watch(unpublishOpen, () => {
  unpublishError.value = ''
})
async function unpublish() {
  unpublishError.value = ''
  await publish(false)
  if (failed.value) unpublishError.value = message.value
  if (!context.value?.published) unpublishOpen.value = false
}
</script>
<template>
  <div class="cf-site-page-header">
    <div class="cf-site-heading">
      <h1>{{ $t('cloud.messages.overview') }}</h1>
      <div class="cf-site-publication">
        <CfBadge :tone="context?.published ? 'success' : 'neutral'">{{
          context?.published
            ? $t('cloud.messages.published')
            : $t('cloud.messages.privateDraft')
        }}</CfBadge>
        <span>{{
          context?.published
            ? $t('cloud.messages.yourGalleryIsLive')
            : $t('cloud.messages.onlyYourWorkspaceCanManageThisGallery')
        }}</span>
      </div>
    </div>
    <div class="cf-site-page-actions">
      <CfButton
        v-if="context?.published && address"
        as-child
        variant="secondary"
        size="sm"
        ><a
          :href="address"
          target="_blank"
          rel="noopener noreferrer"
          >{{ $t('cloud.messages.viewSite') }}<ArrowUpRight :size="14" /></a
      ></CfButton>
      <CfButton
        v-if="admin"
        :variant="context?.published ? 'ghost' : 'default'"
        size="sm"
        :disabled="
          busy || (!context?.published && (!defaultDomainsReady || !host))
        "
        :loading="busy"
        @click="context?.published ? (unpublishOpen = true) : publish(true)"
        ><Globe :size="14" />{{
          context?.published
            ? $t('cloud.messages.unpublish')
            : $t('cloud.messages.publishGallery')
        }}</CfButton
      >
    </div>
    <p
      v-if="!defaultDomainsReady"
      class="cf-field-hint"
    >
      {{ $t('cloud.domains.routingPending') }}
    </p>
    <CfAlert
      v-if="domainError"
      tone="error"
      >{{ $t('cloud.domains.loadFailed')
      }}<CfButton
        size="sm"
        variant="secondary"
        @click="refreshDomains()"
        >{{ $t('cloud.messages.retry') }}</CfButton
      ></CfAlert
    >
    <div class="cf-site-address-block">
      <div
        v-if="address"
        class="cf-site-address-row"
      >
        <span class="cf-site-address-label">{{
          context?.published
            ? $t('cloud.messages.publicAddress')
            : $t('cloud.messages.reservedAddress')
        }}</span>
        <span class="cf-site-address-value">{{ address }}</span>
        <CfButton
          variant="ghost"
          size="sm"
          :aria-label="
            copied
              ? $t('cloud.messages.addressCopied2')
              : $t('cloud.messages.copySiteAddress')
          "
          @click="copyAddress"
          ><Check
            v-if="copied"
            :size="14"
          /><Copy
            v-else
            :size="14"
          />{{
            copied ? $t('cloud.messages.copied') : $t('cloud.messages.copyLink')
          }}</CfButton
        >
      </div>
      <p
        v-else-if="status === 'pending'"
        class="cf-draft-hint"
      >
        {{ $t('cloud.messages.loadingSiteAddress') }}
      </p>
      <p
        v-else-if="error"
        class="cf-draft-hint"
        role="alert"
      >
        {{ $t('cloud.messages.siteAddressCouldNotBeLoaded')
        }}<CfButton
          variant="ghost"
          size="sm"
          @click="refresh()"
          >{{ $t('cloud.messages.retry') }}</CfButton
        >
      </p>
      <p
        v-else
        class="cf-draft-hint"
      >
        {{ $t('cloud.messages.noDefaultAddressIsAvailableForThisSite') }}
      </p>
      <p
        v-if="!context?.published"
        class="cf-draft-hint"
      >
        {{ $t(admin ? 'cloud.ui.draftReady' : 'cloud.ui.draftAskAdmin') }}
      </p>
      <p
        v-if="copied || copyError"
        class="cf-draft-hint"
        role="status"
      >
        {{
          copyError
            ? $t('cloud.messages.couldNotCopyTheLinkSelectAndCopyThe')
            : $t('cloud.messages.siteAddressCopiedToClipboard')
        }}
      </p>
    </div>
    <UModal
      v-model:open="unpublishOpen"
      :title="$t('cloud.messages.unpublishThisGallery')"
      :description="
        $t('cloud.messages.yourPublicAddressAndSharedLinksWillReturn40')
      "
      :dismissible="!busy"
    >
      <template
        v-if="unpublishError"
        #body
        ><p
          role="alert"
          class="cf-notice cf-notice-error"
        >
          {{ unpublishError }}
        </p></template
      >
      <template #footer>
        <CfButton
          variant="secondary"
          :disabled="busy"
          @click="unpublishOpen = false"
          >{{ $t('cloud.messages.cancel') }}</CfButton
        >
        <CfButton
          variant="destructive"
          :loading="busy"
          @click="unpublish"
          >{{ $t('cloud.messages.unpublishGallery') }}</CfButton
        >
      </template>
    </UModal>
  </div>
</template>
