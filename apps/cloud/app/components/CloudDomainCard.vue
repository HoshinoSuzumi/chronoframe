<script setup lang="ts">
import type { CustomDomain } from '@chronoframe/contracts/domains'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
} from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'reka-ui'
const props = defineProps<{
  domain: CustomDomain
  admin: boolean
  enabled: boolean
  published: boolean
  busy: boolean
  retrySeconds: number
  expanded: boolean
}>()
const emit = defineEmits<{
  action: [domain: CustomDomain, operation: string, value?: boolean]
  copy: [value: string]
  remove: [domain: CustomDomain]
}>()
const { t, te, locale } = useI18n()
const open = ref(props.expanded || props.domain.status === 'pending')
watch(
  () => props.expanded,
  (value) => {
    if (value) open.value = true
  },
)
const dnsReady = computed(() => props.domain.dnsStatus === 'ready')
const certificateReady = computed(
  () =>
    props.domain.hostnameStatus === 'active' &&
    props.domain.sslStatus === 'active',
)
const steps = computed(() => [
  { label: t('cloud.domainFlow.dnsStep'), complete: dnsReady.value },
  {
    label: t('cloud.domainFlow.certificateStep'),
    complete: dnsReady.value && certificateReady.value,
  },
  {
    label: t('cloud.domainFlow.readyStep'),
    complete: props.domain.status === 'active',
  },
])
const currentStep = computed(() => steps.value.findIndex((s) => !s.complete))
const canVerify = computed(
  () =>
    props.enabled &&
    !props.busy &&
    props.retrySeconds === 0 &&
    !['deleting', 'paused', 'expired'].includes(props.domain.status),
)
const statusLabel = computed(() =>
  props.domain.status !== 'pending'
    ? t('cloud.domains.states.' + props.domain.status)
    : t(
        !dnsReady.value
          ? 'cloud.domainFlow.needsDns'
          : !certificateReady.value
            ? 'cloud.domainFlow.issuingCertificate'
            : 'cloud.domainFlow.preparingRoute',
      ),
)
const guidance = computed(() =>
  t(
    props.domain.status === 'deleting'
      ? 'cloud.domainFlow.removingHelp'
      : props.domain.status === 'expired'
        ? 'cloud.domainFlow.expiredHelp'
        : props.domain.status === 'active'
          ? 'cloud.domainFlow.connectedHelp'
          : props.domain.status === 'paused'
            ? 'cloud.domainFlow.pausedHelp'
            : !dnsReady.value
              ? 'cloud.domainFlow.dnsHelp'
              : !certificateReady.value
                ? 'cloud.domainFlow.certificateHelp'
                : 'cloud.domainFlow.routeHelp',
  ),
)
</script>
<template>
  <article
    class="cf-domain-card"
    :id="'domain-' + domain.generation"
  >
    <p
      v-if="domain.holdReason && domain.holdReason !== 'manual'"
      class="cf-notice"
    >
      {{
        t(
          'cloud.enforcement.' +
            { plan: 'holdPlan', site: 'holdSite', account: 'holdAccount' }[
              domain.holdReason
            ],
        )
      }}
    </p>
    <p
      v-if="domain.cleanupPending"
      class="cf-field-hint"
      role="status"
    >
      {{ t('cloud.enforcement.cleanup') }}
    </p>
    <div class="cf-domain-card-header">
      <Globe
        :size="18"
        class="cf-domain-icon"
        aria-hidden="true"
      />
      <div class="cf-domain-card-identity">
        <h3>{{ domain.hostname }}</h3>
        <span
          v-if="domain.primary"
          class="cf-domain-primary"
          >{{ t('cloud.domains.primary') }}</span
        >
      </div>
      <CfBadge :tone="domain.status === 'active' ? 'success' : 'neutral'">{{
        statusLabel
      }}</CfBadge>
      <DropdownMenuRoot v-if="admin && domain.status !== 'deleting'"
        ><DropdownMenuTrigger as-child
          ><CfButton
            size="icon"
            variant="ghost"
            :aria-label="
              t('cloud.domainFlow.actions', { hostname: domain.hostname })
            "
            :disabled="busy"
            ><MoreHorizontal :size="17" /></CfButton
        ></DropdownMenuTrigger>
        <DropdownMenuPortal
          ><DropdownMenuContent
            class="cf-account-menu"
            align="end"
            :side-offset="6"
            :collision-padding="12"
          >
            <template v-if="domain.status === 'active'">
              <DropdownMenuItem
                v-if="!domain.primary"
                @select="emit('action', domain, 'primary')"
                >{{ t('cloud.domains.makePrimary') }}</DropdownMenuItem
              >
              <DropdownMenuItem
                v-if="domain.primary"
                @select="emit('action', domain, 'redirects', !domain.redirects)"
                >{{
                  t(
                    domain.redirects
                      ? 'cloud.domains.disableRedirects'
                      : 'cloud.domains.enableRedirects',
                  )
                }}</DropdownMenuItem
              >
              <DropdownMenuSeparator class="cf-menu-separator" />
            </template>
            <DropdownMenuItem
              v-if="!['deleting', 'expired'].includes(domain.status)"
              :disabled="
                domain.status === 'paused' &&
                (!enabled ||
                  (!!domain.holdReason && domain.holdReason !== 'manual'))
              "
              @select="
                emit(
                  'action',
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
              }}</DropdownMenuItem
            >
            <DropdownMenuItem
              :disabled="domain.status === 'deleting'"
              @select="emit('remove', domain)"
              >{{ t('cloud.domains.remove') }}</DropdownMenuItem
            >
          </DropdownMenuContent></DropdownMenuPortal
        >
      </DropdownMenuRoot>
    </div>
    <p class="cf-field-hint cf-domain-guidance">{{ guidance }}</p>
    <div class="cf-domain-card-toolbar">
      <CfButton
        variant="ghost"
        size="sm"
        :aria-expanded="open"
        @click="open = !open"
        >{{
          t(open ? 'cloud.domainFlow.hideDetails' : 'cloud.domainFlow.details')
        }}<ChevronDown
          :size="14"
          :class="{ 'rotate-180': open }"
      /></CfButton>
      <div class="cf-domain-inline-actions">
        <CfButton
          v-if="domain.status === 'active' && published"
          as-child
          size="sm"
          variant="ghost"
          ><a
            :href="'https://' + domain.hostname"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('cloud.messages.viewSite') }}<ExternalLink :size="13" /></a
        ></CfButton>
        <CfButton
          v-if="
            admin && !['paused', 'deleting', 'expired'].includes(domain.status)
          "
          size="sm"
          variant="secondary"
          :disabled="!canVerify"
          @click="emit('action', domain, 'check')"
          ><RefreshCw
            :size="13"
            :class="{ 'cf-spin': busy }"
          />{{
            t(
              retrySeconds > 0
                ? 'cloud.domainFlow.retryIn'
                : 'cloud.domains.check',
              { seconds: retrySeconds },
            )
          }}</CfButton
        >
      </div>
    </div>
    <div
      v-if="open"
      class="cf-domain-details"
    >
      <ol
        class="cf-domain-steps"
        :aria-label="t('cloud.domainFlow.progress')"
      >
        <li
          v-for="(step, index) in steps"
          :key="index"
          :class="{
            'is-complete': step.complete,
            'is-current': index === currentStep,
          }"
          :aria-current="index === currentStep ? 'step' : undefined"
        >
          <span class="cf-domain-step-number"
            ><Check
              v-if="step.complete"
              :size="12"
            /><template v-else>{{ index + 1 }}</template></span
          ><span>{{ step.label }}</span>
        </li>
      </ol>
      <div class="cf-domain-dns-record">
        <div>
          <span>{{ t('cloud.domainFlow.recordType') }}</span
          ><strong>CNAME</strong>
        </div>
        <div>
          <span>{{ t('cloud.domainFlow.recordName') }}</span
          ><code>{{ domain.hostname }}</code>
        </div>
        <div class="cf-domain-record-value">
          <span>{{ t('cloud.domainFlow.recordValue') }}</span
          ><code>{{ domain.cnameTarget }}</code
          ><CfButton
            size="icon"
            variant="ghost"
            :aria-label="t('cloud.domains.copyTarget')"
            @click="emit('copy', domain.cnameTarget)"
            ><Copy :size="14"
          /></CfButton>
        </div>
      </div>
      <p class="cf-field-hint">{{ t('cloud.domains.dnsOnly') }}</p>
      <div class="cf-domain-verification-status">
        <ShieldCheck :size="15" /><span>{{
          t(
            domain.status === 'paused' || !enabled
              ? 'cloud.domainFlow.checksPaused'
              : 'cloud.domainFlow.automaticChecks',
          )
        }}</span
        ><span v-if="domain.checkedAt"
          ><ClientOnly
            >{{
              t('cloud.domains.checked', {
                time: new Date(domain.checkedAt).toLocaleString(locale),
              })
            }}<template #fallback>{{
              t('cloud.domains.checked', {
                time: new Date(domain.checkedAt).toISOString(),
              })
            }}</template></ClientOnly
          ></span
        >
      </div>
      <details class="cf-domain-technical">
        <summary>{{ t('cloud.domainFlow.technical') }}</summary>
        <dl>
          <div>
            <dt>{{ t('cloud.domains.dns') }}</dt>
            <dd>{{ t('cloud.domains.dnsStates.' + domain.dnsStatus) }}</dd>
          </div>
          <div>
            <dt>{{ t('cloud.domains.provider') }}</dt>
            <dd>
              <code>{{ domain.hostnameStatus }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ t('cloud.domains.certificate') }}</dt>
            <dd>
              <code>{{ domain.sslStatus }}</code>
            </dd>
          </div>
        </dl>
      </details>
    </div>
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
  </article>
</template>
