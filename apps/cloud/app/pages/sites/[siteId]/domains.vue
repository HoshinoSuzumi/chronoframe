<script setup lang="ts">
import type {
  CustomDomain,
  DomainOverview,
} from '@chronoframe/contracts/domains'
import { Copy, Globe, RefreshCw, Plus, ExternalLink } from 'lucide-vue-next'
const { t, te, locale } = useI18n()
definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: () => t('cloud.messages.domainsChronoframeCloud'),
  robots: 'noindex',
})
const site = useEntryContext().value!,
  base = `/api/sites/${site.siteId}`
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
watch(result, (value) => {
  if (value) data.value = value
})
const { data: settings, refresh: refreshSettings } = await useFetch<{
  site: { slug: string; revision: number }
}>(base + '/settings')
slug.value = settings.value?.site.slug ?? ''
let mounted = true
const clock = ref(Date.now())
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
      data.value.domains.some((d) =>
        ['pending', 'deleting'].includes(d.status),
      ) &&
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
const canCheck = (domain: CustomDomain) =>
  domain.nextCheckAt <= clock.value + 30000
async function run(body: Record<string, unknown>) {
  if (busy.value || !data.value?.admin) return
  busy.value = true
  notice.value = ''
  failure.value = false
  try {
    await $fetch(base + '/domains', { method: 'POST', body })
    if (!mounted) return
    await Promise.all([refresh(), refreshSettings()])
    notice.value = t('cloud.domains.saved')
    if (body.action === 'add') hostname.value = ''
  } catch (cause) {
    if (!mounted) return
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
  if (
    operation === 'delete' &&
    !window.confirm(
      t('cloud.domains.removeConfirm', { hostname: domain.hostname }),
    )
  )
    return
  await run({
    action: operation,
    hostname: domain.hostname,
    generation: domain.generation,
    revision: domain.revision,
    value,
  })
}
async function rename() {
  if (!settings.value || !window.confirm(t('cloud.domains.renameConfirm')))
    return
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
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ t('cloud.messages.domains') }}</h1>
        <p class="cf-page-description">
          {{ t('cloud.messages.addressesVisitorsUseToReachYourGallery') }}
        </p>
      </div>
      <CloudButton
        variant="ghost"
        size="sm"
        :disabled="busy || status === 'pending'"
        @click="refresh()"
        ><RefreshCw :size="15" />{{ t('cloud.domains.refresh') }}</CloudButton
      >
    </div>
    <p
      v-if="error && !data"
      class="cf-notice cf-notice-error"
      role="alert"
    >
      {{ t('cloud.domains.loadFailed')
      }}<CloudButton
        variant="ghost"
        @click="refresh()"
        >{{ t('cloud.messages.retry') }}</CloudButton
      >
    </p>
    <p
      v-if="notice"
      :role="failure ? 'alert' : 'status'"
      class="cf-notice"
      :class="{ 'cf-notice-error': failure }"
    >
      {{ notice }}
    </p>
    <template v-if="data">
      <CloudCard
        ><div class="cf-panel-heading">
          <h2>{{ t('cloud.messages.defaultSubdomain') }}</h2>
          <p>{{ t('cloud.domains.defaultHelp') }}</p>
        </div>
        <div class="cf-panel-body space-y-3">
          <template v-if="data.defaultHostname"
            ><p class="cf-address-preview">
              https://{{ data.defaultHostname }}
            </p>
            <div class="flex flex-wrap gap-2">
              <CloudButton
                variant="secondary"
                size="sm"
                @click="copy('https://' + data.defaultHostname)"
                ><Copy :size="14" />{{
                  t('cloud.messages.copyAddress')
                }}</CloudButton
              ><CloudButton
                v-if="site.published && data.defaultReady"
                as-child
                variant="ghost"
                size="sm"
                ><a
                  :href="'https://' + data.defaultHostname"
                  target="_blank"
                  rel="noopener noreferrer"
                  ><ExternalLink :size="14" />{{
                    t('cloud.messages.viewSite')
                  }}</a
                ></CloudButton
              >
            </div></template
          >
          <p
            v-else
            class="cf-notice cf-notice-error"
          >
            {{ t('cloud.domains.defaultConflict') }}
          </p>
          <form
            v-if="data.admin"
            class="space-y-2"
            @submit.prevent="rename"
          >
            <label
              class="cf-field-label"
              for="site-domain-slug"
              >{{ t('cloud.domains.changeAddress') }}</label
            ><CloudInput
              id="site-domain-slug"
              v-model="slug"
              autocomplete="off"
              :disabled="busy"
              minlength="3"
              maxlength="40"
              required
            />
            <p class="cf-field-hint">
              {{ t('cloud.domains.slugHint', { base: data.baseDomain }) }}
            </p>
            <CloudButton
              type="submit"
              size="sm"
              variant="secondary"
              :disabled="
                busy || !data.defaultReady || slug === settings?.site.slug
              "
              >{{ t('cloud.messages.saveChanges') }}</CloudButton
            >
          </form>
          <p
            v-if="!data.defaultReady"
            class="cf-notice"
          >
            {{ t('cloud.domains.routingPending') }}
          </p>
          <CloudButton
            v-if="data.admin && data.domains.some((d) => d.primary)"
            variant="secondary"
            size="sm"
            :disabled="busy"
            @click="run({ action: 'default' })"
            >{{ t('cloud.domains.useDefault') }}</CloudButton
          >
          <p class="cf-field-hint">{{ t('cloud.domains.aliasPolicy') }}</p>
          <p
            v-if="data.legacyHostname"
            class="cf-field-hint break-all"
          >
            {{ t('cloud.domains.legacy', { hostname: data.legacyHostname }) }}
          </p>
        </div></CloudCard
      >
      <CloudCard
        ><div class="cf-panel-heading">
          <h2>{{ t('cloud.messages.customDomains') }}</h2>
          <p>{{ t('cloud.domains.intro') }}</p>
        </div>
        <div class="cf-panel-body space-y-4">
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
          <form
            v-if="data.admin"
            class="space-y-2"
            @submit.prevent="run({ action: 'add', hostname })"
          >
            <label
              class="cf-field-label"
              for="custom-domain"
              >{{ t('cloud.domains.hostname') }}</label
            ><CloudInput
              id="custom-domain"
              v-model="hostname"
              :disabled="busy || !data.enabled"
              placeholder="photos.example.com"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              maxlength="253"
              required
            />
            <p class="cf-field-hint">{{ t('cloud.domains.addHint') }}</p>
            <CloudButton
              type="submit"
              size="sm"
              :disabled="busy || !data.enabled || !hostname.trim()"
              ><Plus :size="14" />{{ t('cloud.domains.add') }}</CloudButton
            >
          </form>
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
          <div class="rounded-lg border border-[var(--border)] p-3 space-y-2">
            <p class="cf-field-label">{{ t('cloud.domains.cnameRecord') }}</p>
            <code class="block break-all text-sm">{{ data.cnameTarget }}</code
            ><CloudButton
              variant="ghost"
              size="sm"
              @click="copy(data.cnameTarget)"
              ><Copy :size="14" />{{
                t('cloud.domains.copyTarget')
              }}</CloudButton
            >
            <p class="cf-field-hint">{{ t('cloud.domains.dnsOnly') }}</p>
          </div>
          <p
            v-if="!data.domains.length"
            class="cf-field-hint"
          >
            {{ t('cloud.domains.empty') }}
          </p>
          <article
            v-for="domain in data.domains"
            :key="domain.hostname + domain.generation"
            class="rounded-lg border border-[var(--border)] p-3 space-y-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="font-semibold text-sm break-all">
                  <Globe
                    :size="14"
                    class="inline-block"
                  />
                  {{ domain.hostname }}
                </h3>
                <p
                  v-if="domain.primary"
                  class="cf-field-hint"
                >
                  {{ t('cloud.domains.primary') }}
                </p>
              </div>
              <CloudBadge
                :tone="domain.status === 'active' ? 'success' : 'neutral'"
                >{{ t('cloud.domains.states.' + domain.status) }}</CloudBadge
              >
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <dt>{{ t('cloud.domains.dns') }}</dt>
                <dd>{{ t('cloud.domains.dnsStates.' + domain.dnsStatus) }}</dd>
              </div>
              <div>
                <dt>{{ t('cloud.domains.provider') }}</dt>
                <dd class="break-all">
                  <code>{{ domain.hostnameStatus }}</code>
                </dd>
              </div>
              <div>
                <dt>{{ t('cloud.domains.certificate') }}</dt>
                <dd class="break-all">
                  <code>{{ domain.sslStatus }}</code>
                </dd>
              </div>
            </dl>
            <p
              v-if="domain.dnsStatus === 'awaiting_change'"
              class="cf-notice"
            >
              {{ t('cloud.domains.resetCname') }}
            </p>
            <p
              v-else-if="
                domain.dnsStatus === 'missing' && domain.status !== 'deleting'
              "
              class="cf-field-hint"
            >
              {{
                t('cloud.domains.setCname', {
                  hostname: domain.hostname,
                  target: data.cnameTarget,
                })
              }}
            </p>
            <p
              v-if="domain.error"
              class="cf-notice cf-notice-error"
              role="alert"
            >
              {{
                t(
                  te('cloud.domains.errors.' + domain.error)
                    ? 'cloud.domains.errors.' + domain.error
                    : 'cloud.domains.failed',
                )
              }}
            </p>
            <p
              v-if="domain.checkedAt"
              class="cf-field-hint"
            >
              {{
                t('cloud.domains.checked', {
                  time: new Date(domain.checkedAt).toLocaleString(
                    locale === 'zh-Hans' ? 'zh-CN' : 'en-US',
                  ),
                })
              }}
            </p>
            <div
              v-if="data.admin"
              class="flex flex-wrap gap-2"
            >
              <CloudButton
                variant="secondary"
                size="sm"
                :disabled="
                  busy ||
                  !data.enabled ||
                  !canCheck(domain) ||
                  ['paused', 'deleting'].includes(domain.status)
                "
                @click="action(domain, 'check')"
                >{{ t('cloud.domains.check') }}</CloudButton
              ><CloudButton
                v-if="domain.status === 'active' && !domain.primary"
                variant="secondary"
                size="sm"
                :disabled="busy"
                @click="action(domain, 'primary')"
                >{{ t('cloud.domains.makePrimary') }}</CloudButton
              ><CloudButton
                v-if="domain.primary"
                variant="secondary"
                size="sm"
                :disabled="busy"
                @click="action(domain, 'redirects', !domain.redirects)"
                >{{
                  t(
                    domain.redirects
                      ? 'cloud.domains.disableRedirects'
                      : 'cloud.domains.enableRedirects',
                  )
                }}</CloudButton
              ><CloudButton
                v-if="domain.status !== 'deleting'"
                variant="ghost"
                size="sm"
                :disabled="
                  busy || (domain.status === 'paused' && !data.enabled)
                "
                @click="
                  action(
                    domain,
                    domain.status === 'paused' ? 'resume' : 'pause',
                  )
                "
                >{{
                  t(
                    domain.status === 'paused'
                      ? 'cloud.domains.resume'
                      : 'cloud.domains.pause',
                  )
                }}</CloudButton
              ><CloudButton
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="action(domain, 'delete')"
                >{{ t('cloud.domains.remove') }}</CloudButton
              >
            </div>
          </article>
        </div></CloudCard
      >
    </template>
  </div>
</template>
