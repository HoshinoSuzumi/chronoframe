<script setup lang="ts">
import { BILLING_LIMITS, allowance } from '../../utils/billing-format'
definePageMeta({ layout: 'portal' })
const { t, locale } = useI18n(),
  links = useCloudLinks(),
  billing = useWorkspaceBilling()
const { selected, data, error, listError, status, refresh, retry, ready } =
  billing
const payments = useCloudPayments(() => selected.value, refresh)
const returned = useDodoCheckoutReturn(
  () => selected.value,
  () => !!payments.data.value?.enabled,
  async () => {
    await Promise.all([refresh(), payments.refresh({ reconcile: false })])
  },
)
const latestSubscription = computed(() => {
  const rows = payments.data.value?.subscriptions ?? []
  return (
    rows.find((s: any) => !['expired', 'canceled'].includes(s.status)) ??
    rows[0]
  )
})
const quotaKeys = BILLING_LIMITS.filter((key) => key !== 'byos')
await ready
useSeoMeta({
  title: t('cloud.billing.plan') + ' — ChronoFrame Cloud',
  robots: 'noindex',
})
useIntervalFn(() => {
  if (document.visibilityState === 'visible' && status.value !== 'pending')
    void refresh()
}, 15000)
const used = (key: string) =>
  key === 'fileBytes' ? null : Number(data.value?.usage[key] ?? 0)
const ratio = (key: string) =>
  Math.min(
    100,
    Math.round(
      ((used(key) ?? 0) / Math.max(1, data.value?.plan.limits[key] ?? 0)) * 100,
    ),
  )
const date = (time: number) => new Date(time).toLocaleString(locale.value)
</script>
<template>
  <div class="cf-plan-page">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ $t('cloud.billing.plan') }}</h1>
        <p class="cf-page-description">{{ $t('cloud.billing.planHelp') }}</p>
      </div>
    </div>
    <UModal
      :open="returned.state.value === 'checking'"
      :dismissible="false"
      :close="false"
      :title="$t('cloud.payments.processing')"
      :ui="{
        content: 'cf-payment-processing-modal',
        header: 'sr-only',
        body: 'p-0',
      }"
    >
      <template #body>
        <div
          class="cf-payment-processing"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            class="cf-payment-spinner"
            aria-hidden="true"
          />
          <p>{{ $t('cloud.payments.processing') }}</p>
        </div>
      </template>
    </UModal>
    <p
      v-if="!['idle', 'checking'].includes(returned.state.value)"
      class="cf-notice"
      role="status"
    >
      {{ $t('cloud.payments.return_' + returned.state.value) }}
      <CfButton
        v-if="['pending', 'failed'].includes(returned.state.value)"
        variant="ghost"
        @click="returned.retry"
        >{{ $t('cloud.payments.checkAgain') }}</CfButton
      >
    </p>
    <CfCard
      v-if="error || listError"
      role="alert"
      ><p>{{ $t('cloud.billing.failed') }}</p>
      <CfButton @click="retry">{{
        $t('cloud.billing.retry')
      }}</CfButton></CfCard
    ><template v-else-if="data"
      ><CfCard class="cf-subscription-overview">
        <div>
          <span class="cf-eyebrow">{{ $t('cloud.billing.current') }}</span>
          <h2>{{ data.plan.name }}</h2>
          <p v-if="data.subscription.source === 'promotion'">
            {{ $t('cloud.billing.signupOffer') }}
          </p>
        </div>
        <div>
          <span class="cf-field-hint">{{
            $t('cloud.billing.subscriptionStatus')
          }}</span>
          <p>
            {{
              latestSubscription
                ? $t('cloud.payments.status.' + latestSubscription.status)
                : $t(
                    data.subscription.source === 'payment'
                      ? 'cloud.payments.checkingStatus'
                      : 'cloud.billing.includedPlan',
                  )
            }}
          </p>
        </div>
        <div>
          <span class="cf-field-hint">{{ $t('cloud.billing.expiry') }}</span>
          <p>
            {{
              data.subscription.expiresAt
                ? date(data.subscription.expiresAt)
                : $t('cloud.billing.noExpiry')
            }}
          </p>
        </div>
        <div class="cf-plan-management">
          <CfButton
            v-if="data.workspace.role === 'admin'"
            as-child
            variant="secondary"
            ><NuxtLink :to="links.redeem">{{
              $t('cloud.billing.redeem')
            }}</NuxtLink></CfButton
          >
        </div>
        <p
          v-if="payments.error.value"
          class="cf-error-message"
          role="alert"
        >
          {{ payments.error.value }}
        </p>
      </CfCard>
      <section>
        <div class="cf-plan-section-heading">
          <div>
            <h2>{{ $t('cloud.billing.usage') }}</h2>
            <p class="cf-field-hint">
              {{
                $t('cloud.billing.period', {
                  start: date(data.quotaPeriod.start),
                  end: date(data.quotaPeriod.end),
                })
              }}
            </p>
          </div>
          <CfButton
            variant="ghost"
            :disabled="status === 'pending'"
            @click="refresh"
            >{{ $t('cloud.billing.refresh') }}</CfButton
          >
        </div>
        <div class="cf-quota-grid">
          <article
            v-for="key in quotaKeys"
            :key="key"
            class="cf-quota-card"
          >
            <h3>{{ $t('cloud.billing.' + key) }}</h3>
            <p v-if="used(key) === null">
              <strong>{{
                allowance(key, data.plan.limits[key], locale)
              }}</strong
              ><span>{{ $t('cloud.billing.perFile') }}</span>
            </p>
            <template v-else
              ><p>
                <strong>{{ allowance(key, used(key)!, locale) }}</strong
                ><span
                  >/ {{ allowance(key, data.plan.limits[key], locale) }}</span
                >
              </p>
              <CfProgress
                :value="ratio(key)"
                :aria-label="$t('cloud.billing.' + key)"
                :class="{ 'is-over': used(key)! > data.plan.limits[key] }"
              />
              <small
                :class="{
                  'cf-error-message': used(key)! > data.plan.limits[key],
                }"
                >{{
                  used(key)! > data.plan.limits[key]
                    ? $t('cloud.billing.overQuota')
                    : $t('cloud.billing.remaining', {
                        value: allowance(
                          key,
                          Math.max(0, data.plan.limits[key] - used(key)!),
                          locale,
                        ),
                      })
                }}</small
              ></template
            >
          </article>
        </div>
        <div class="cf-plan-usage-notes">
          <p class="cf-field-hint">{{ $t('cloud.billing.usageHelp') }}</p>
          <p class="cf-field-hint">
            {{ $t('cloud.billing.byos') }}:
            {{
              data.plan.limits.byos
                ? $t('cloud.billing.yes')
                : $t('cloud.billing.no')
            }}
            ·
            {{
              $t('cloud.billing.connectionCount', { count: data.usage.byos })
            }}
          </p>
        </div>
      </section>
      <section
        id="plans"
        class="cf-plan-options"
      >
        <CloudPricing
          portal
          embedded
          :workspace-billing="billing"
          :payment-controller="payments"
        />
      </section>
      <details class="cf-billing-details">
        <summary>{{ $t('cloud.billing.byosAllowances') }}</summary>
        <dl>
          <template
            v-for="key in BILLING_LIMITS"
            :key="key"
            ><dt>{{ $t('cloud.billing.' + key) }}</dt>
            <dd>
              {{ allowance(key, data.plan.byosLimits[key], locale) }}
            </dd></template
          >
        </dl>
      </details>
      <details
        v-if="data.history.length"
        class="cf-billing-details"
      >
        <summary>{{ $t('cloud.billing.history') }}</summary>
        <ol class="cf-subscription-history">
          <li
            v-for="(event, index) in data.history"
            :key="index"
          >
            <span>{{ $t('cloud.billing.event_' + event.kind) }}</span
            ><time>{{ date(event.created_at) }}</time>
          </li>
        </ol>
      </details></template
    >
    <div
      v-else
      role="status"
      class="cf-notice"
    >
      {{ $t('cloud.billing.loading') }}
    </div>
  </div>
</template>
