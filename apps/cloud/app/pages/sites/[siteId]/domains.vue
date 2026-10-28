<script setup lang="ts">
import type {
  CustomDomain,
  DomainOverview,
} from '@chronoframe/contracts/domains'
import { Copy, Globe, RefreshCw, Plus, Pencil } from 'lucide-vue-next'
const { t } = useI18n()
definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: () => t('cloud.messages.domainsChronoframeCloud'),
  robots: 'noindex',
})
const site = useEntryContext().value!,
  base = `/api/sites/${site.siteId}`
const quota = useCloudQuota(site.workspaceId)
const admission = computed(() => quota.gate('customDomains'))
const {
  data: result,
  error,
  refresh,
  status,
} = await useFetch<DomainOverview>(base + '/domains')
// Retain the last valid view while a refresh or outgoing navigation completes.
const data = ref(result.value),
  notice = ref(''),
  failure = ref(false),
  busy = ref(false),
  hostname = ref(''),
  slug = ref('')
const addOpen = ref(false),
  renameOpen = ref(false),
  removal = shallowRef<CustomDomain | null>(null),
  expandedHost = ref('')
watch([addOpen, renameOpen, () => !!removal.value], (current, previous) => {
  if (
    failure.value &&
    current.some((open, index) => previous[index] && !open)
  ) {
    failure.value = false
    notice.value = ''
  }
})
watch(result, (value) => {
  if (value) data.value = value
})
const { data: settings, refresh: refreshSettings } = await useFetch<{
  site: { slug: string; revision: number }
}>(base + '/settings')
slug.value = settings.value?.site.slug ?? ''
let mounted = true
const clock = useState<number>(base + '/domains/clock', () => Date.now())
let timer: ReturnType<typeof setInterval> | undefined,
  poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    clock.value = Date.now()
  }, 1000)
  poll = setInterval(() => {
    if (
      mounted &&
      document.visibilityState === 'visible' &&
      data.value?.enabled &&
      data.value.domains.length > 0 &&
      status.value !== 'pending' &&
      !busy.value
    )
      void refresh()
  }, 15000)
})
onBeforeUnmount(() => {
  mounted = false
  if (timer) clearInterval(timer)
  if (poll) clearInterval(poll)
})
function beginRename() {
  slug.value = settings.value?.site.slug ?? ''
  notice.value = ''
  failure.value = false
  renameOpen.value = true
}
async function beginAdd() {
  await quota.refresh()
  if (!admission.value.allowed || quota.error.value) return
  notice.value = ''
  failure.value = false
  addOpen.value = true
}
function beginRemove(domain: CustomDomain) {
  notice.value = ''
  failure.value = false
  removal.value = domain
}
async function refreshAll() {
  await Promise.all([refresh(), refreshSettings(), quota.refresh()])
}
async function run(body: Record<string, unknown>) {
  if (busy.value || !data.value?.admin) return
  busy.value = true
  notice.value = ''
  failure.value = false
  try {
    const response = await $fetch<{ domain?: CustomDomain }>(
      base + '/domains',
      { method: 'POST', body },
    )
    if (!mounted) return false
    await Promise.all([refresh(), refreshSettings(), quota.refresh()])
    notice.value = t('cloud.domains.saved')
    if (body.action === 'add') {
      expandedHost.value = response.domain?.hostname ?? String(body.hostname)
      hostname.value = ''
      addOpen.value = false
    }
    if (body.action === 'rename') renameOpen.value = false
    if (body.action === 'delete') removal.value = null
    return true
  } catch (cause) {
    if (!mounted) return false
    const code = (cause as { data?: { data?: { code?: string } } }).data?.data
      ?.code
    failure.value = true
    const allowed = [
      'domain_invalid',
      'domain_reserved',
      'domain_conflict',
      'domain_changed',
      'domain_admin_required',
      'domain_not_found',
      'domain_limit',
      'domain_wait',
      'domain_cleanup_pending',
      'domain_not_ready',
      'domain_unavailable',
      'domain_dns_unavailable',
      'domain_provider_unavailable',
      'domain_provider_conflict',
      'domain_provider_missing',
      'domain_routing_unavailable',
    ]
    if (code === 'domain_changed') await refreshAll()
    notice.value = t(
      code && allowed.includes(code)
        ? 'cloud.domains.errors.' + code
        : 'cloud.domains.failed',
    )
  } finally {
    busy.value = false
  }
}
async function action(domain: CustomDomain, operation: string, value = false) {
  const current =
    data.value?.domains.find(
      (d) =>
        d.hostname === domain.hostname && d.generation === domain.generation,
    ) ?? domain
  await run({
    action: operation,
    hostname: domain.hostname,
    generation: domain.generation,
    revision: current.revision,
    value,
  })
}
async function rename() {
  if (!settings.value) return
  await run({
    action: 'rename',
    slug: slug.value,
    revision: settings.value.site.revision,
  })
}
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    failure.value = false
    notice.value = t('cloud.messages.addressCopied')
  } catch {
    failure.value = true
    notice.value = t('cloud.messages.couldNotCopySelectAndCopyTheAddressAbove')
  }
}
</script>
<template>
  <div class="cf-site-settings-stack cf-domain-page">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ t('cloud.messages.domains') }}</h1>
        <p class="cf-page-description">
          {{ t('cloud.messages.addressesVisitorsUseToReachYourGallery') }}
        </p>
      </div>
      <CfButton
        variant="ghost"
        size="sm"
        :disabled="busy || status === 'pending'"
        @click="refreshAll()"
        ><RefreshCw :size="15" />{{ t('cloud.domains.refresh') }}</CfButton
      >
    </div>
    <p
      v-if="error && !data"
      class="cf-notice cf-notice-error"
      role="alert"
    >
      {{ t('cloud.domains.loadFailed')
      }}<CfButton
        variant="ghost"
        @click="refreshAll()"
        >{{ t('cloud.messages.retry') }}</CfButton
      >
    </p>
    <p
      v-if="notice && !addOpen && !renameOpen && !removal"
      :role="failure ? 'alert' : 'status'"
      class="cf-notice"
      :class="{ 'cf-notice-error': failure }"
    >
      {{ notice }}
    </p>
    <template v-if="data">
      <CfCard
        ><div class="cf-panel-heading cf-domain-section-heading">
          <div>
            <h2>{{ t('cloud.messages.defaultSubdomain') }}</h2>
            <p>{{ t('cloud.domains.defaultHelp') }}</p>
          </div>
          <CfButton
            v-if="data.admin"
            variant="ghost"
            size="sm"
            :disabled="busy || !data.defaultReady"
            @click="beginRename"
            ><Pencil :size="13" />{{
              t('cloud.domains.changeAddress')
            }}</CfButton
          >
        </div>
        <div class="cf-domain-default-row">
          <Globe :size="18" />
          <a
            v-if="data.defaultHostname && data.defaultReady && site.published"
            class="cf-domain-address"
            :href="'https://' + data.defaultHostname"
            target="_blank"
            rel="noopener noreferrer"
            ><code>{{ data.defaultHostname }}</code></a
          >
          <code
            v-else-if="data.defaultHostname"
            class="cf-domain-address"
            >{{ data.defaultHostname }}</code
          >
          <span v-else>{{ t('cloud.domains.defaultConflict') }}</span>
          <CfButton
            v-if="data.defaultHostname"
            variant="ghost"
            size="icon"
            :aria-label="t('cloud.messages.copyAddress')"
            @click="copy('https://' + data.defaultHostname)"
            ><Copy :size="14"
          /></CfButton>
        </div>
        <div
          v-if="!data.defaultReady || data.domains.some((d) => d.primary)"
          class="cf-domain-default-footer"
        >
          <p
            v-if="!data.defaultReady"
            class="cf-field-hint"
          >
            {{ t('cloud.domains.routingPending') }}
          </p>
          <CfButton
            v-if="data.admin && data.domains.some((d) => d.primary)"
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="run({ action: 'default' })"
            >{{ t('cloud.domains.useDefault') }}</CfButton
          >
        </div>
      </CfCard>
      <section class="cf-domain-custom-section">
        <div class="cf-domain-section-heading">
          <div>
            <h2>{{ t('cloud.messages.customDomains') }}</h2>
            <p class="cf-field-hint">{{ t('cloud.domainFlow.customHelp') }}</p>
          </div>
          <CfButton
            v-if="data.admin"
            size="sm"
            :disabled="
              busy || !data.enabled || !admission.allowed || !!quota.error.value
            "
            @click="beginAdd"
            ><Plus :size="14" />{{ t('cloud.domains.add') }}</CfButton
          >
        </div>
        <CloudQuotaNotice
          v-if="data.admin && (admission.reason || quota.error.value)"
          :reason="admission.reason"
          :error="!!quota.error.value"
          @retry="quota.refresh()"
        />
        <p
          v-if="!data.enabled"
          class="cf-notice"
        >
          {{ t('cloud.domains.disabled') }}
        </p>
        <p
          v-else-if="!data.routingReady"
          class="cf-notice"
        >
          {{ t('cloud.domains.routingPending') }}
        </p>
        <div
          v-if="!data.domains.length"
          class="cf-domain-empty"
        >
          <Globe :size="24" />
          <h3>{{ t('cloud.domains.empty') }}</h3>
          <p>{{ t('cloud.domainFlow.emptyHelp') }}</p>
        </div>
        <CloudDomainCard
          v-for="domain in data.domains"
          :key="domain.hostname + domain.generation"
          :domain="domain"
          :admin="data.admin"
          :published="site.published"
          :enabled="data.enabled"
          :busy="busy"
          :retry-seconds="
            Math.max(0, Math.ceil((domain.nextCheckAt - 30000 - clock) / 1000))
          "
          :expanded="expandedHost === domain.hostname"
          @copy="copy"
          @action="action"
          @remove="beginRemove"
        />
        <p
          v-if="!data.admin"
          class="cf-field-hint"
        >
          {{
            t(
              'cloud.messages.onlyWorkspaceAdministratorsCanChangeTheseSettings',
            )
          }}
        </p>
      </section>
      <details
        v-if="data.legacyHostname"
        class="cf-domain-technical"
      >
        <summary>{{ t('cloud.domainFlow.previousAddress') }}</summary>
        <p class="cf-field-hint">
          {{ t('cloud.domains.legacy', { hostname: data.legacyHostname }) }}
        </p>
      </details>
    </template>
    <UModal
      v-model:open="addOpen"
      :title="t('cloud.domains.add')"
      :description="t('cloud.domainFlow.addDescription')"
      :dismissible="!busy"
      ><template #body
        ><form
          class="cf-form"
          @submit.prevent="run({ action: 'add', hostname })"
        >
          <label
            class="cf-field-label"
            for="custom-domain"
            >{{ t('cloud.domains.hostname') }}</label
          ><CfInput
            id="custom-domain"
            v-model="hostname"
            :disabled="busy"
            placeholder="photos.example.com"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="253"
            required
          />
          <p class="cf-field-hint">{{ t('cloud.domains.addHint') }}</p>
          <p
            v-if="failure"
            role="alert"
            class="cf-notice cf-notice-error"
          >
            {{ notice }}
          </p>
          <div class="cf-domain-modal-actions">
            <CfButton
              variant="secondary"
              :disabled="busy"
              @click="addOpen = false"
              >{{ t('cloud.messages.cancel') }}</CfButton
            ><CfButton
              type="submit"
              :disabled="
                busy ||
                !hostname.trim() ||
                !admission.allowed ||
                !!quota.error.value
              "
              :loading="busy"
              >{{ t('cloud.domainFlow.continue') }}</CfButton
            >
          </div>
        </form></template
      ></UModal
    >
    <UModal
      v-model:open="renameOpen"
      :title="t('cloud.domains.changeAddress')"
      :description="t('cloud.domains.aliasPolicy')"
      :dismissible="!busy"
      ><template #body
        ><form
          class="cf-form"
          @submit.prevent="rename"
        >
          <label
            class="cf-field-label"
            for="site-domain-slug"
            >{{ t('cloud.domains.changeAddress') }}</label
          >
          <div class="cf-domain-slug-field">
            <CfInput
              id="site-domain-slug"
              v-model="slug"
              :disabled="busy"
              minlength="3"
              maxlength="40"
              required
            /><span>.{{ data?.baseDomain }}</span>
          </div>
          <p class="cf-field-hint">
            {{ t('cloud.domains.slugHint', { base: data?.baseDomain }) }}
          </p>
          <p
            v-if="failure"
            role="alert"
            class="cf-notice cf-notice-error"
          >
            {{ notice }}
          </p>
          <div class="cf-domain-modal-actions">
            <CfButton
              variant="secondary"
              :disabled="busy"
              @click="renameOpen = false"
              >{{ t('cloud.messages.cancel') }}</CfButton
            ><CfButton
              type="submit"
              :disabled="busy || slug === settings?.site.slug || !slug.trim()"
              :loading="busy"
              >{{ t('cloud.messages.saveChanges') }}</CfButton
            >
          </div>
        </form></template
      ></UModal
    >
    <UModal
      :open="!!removal"
      :title="t('cloud.domains.remove')"
      :description="
        t('cloud.domains.removeConfirm', { hostname: removal?.hostname ?? '' })
      "
      :dismissible="!busy"
      @update:open="
        (value) => {
          if (!value && !busy) removal = null
        }
      "
      ><template #body
        ><p
          v-if="failure"
          role="alert"
          class="cf-notice cf-notice-error"
        >
          {{ notice }}
        </p>
        <div class="cf-domain-modal-actions">
          <CfButton
            variant="secondary"
            :disabled="busy"
            @click="removal = null"
            >{{ t('cloud.messages.cancel') }}</CfButton
          ><CfButton
            variant="destructive"
            :disabled="busy"
            :loading="busy"
            @click="removal && action(removal, 'delete')"
            >{{ t('cloud.domains.remove') }}</CfButton
          >
        </div></template
      ></UModal
    >
  </div>
</template>
