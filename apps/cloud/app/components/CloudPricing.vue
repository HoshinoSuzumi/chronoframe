<script setup lang="ts">
import {
  BILLING_LIMITS,
  allowance,
  price,
  conditionText,
} from '../utils/billing-format'
const props = withDefaults(
  defineProps<{
    portal?: boolean
    embedded?: boolean
    workspaceBilling?: ReturnType<typeof useWorkspaceBilling>
    paymentController?: ReturnType<typeof useCloudPayments>
  }>(),
  { portal: false, embedded: false },
)
const { t, locale } = useI18n(),
  links = useCloudLinks(),
  interval = ref<1 | 3>(1)
const billingPeriod = computed({
  get: () => String(interval.value),
  set: (value: string) => {
    interval.value = value === '3' ? 3 : 1
  },
})
const billing = props.portal
  ? (props.workspaceBilling ?? useWorkspaceBilling())
  : null
const payments = props.portal
  ? (props.paymentController ??
    useCloudPayments(() => billing?.selected.value ?? 0))
  : null
const { data, error, refresh } = await useFetch<any>('/api/billing/catalog', {
  key: 'public-pricing-catalog',
})
const comparisonColumns = computed(() => [
  { accessorKey: 'label', header: t('cloud.billing.allowance') },
  ...(data.value?.plans ?? []).map((plan: any) => ({
    id: 'plan:' + plan.id,
    header: plan.name,
    accessorFn: (row: { values: Record<string, string> }) =>
      row.values[plan.id],
  })),
])
const comparisonRows = computed(() =>
  [...BILLING_LIMITS, 'conditions'].map((key) => ({
    label: t('cloud.billing.' + key),
    values: Object.fromEntries(
      (data.value?.plans ?? []).map((plan: any) => [
        plan.id,
        key === 'conditions'
          ? String(plan.policy.rules.length || '—')
          : allowance(key, plan.policy.limits[key], locale.value),
      ]),
    ),
  })),
)
if (billing) await billing.ready
const currentPlan = computed(() => billing?.data.value?.plan.id)
const amount = (plan: any) =>
  interval.value === 1 ? plan.monthlyPrice : plan.quarterlyPrice
const action = (plan: any) =>
  !props.portal && plan.id === data.value?.newPlanId
    ? links.signup
    : links.redeem +
      (props.portal && billing?.selected.value
        ? '?workspaceId=' + billing.selected.value
        : '')
const payment = computed(() => payments?.data.value),
  paying = ref(''),
  paymentError = ref('')
let mounted = true
onBeforeUnmount(() => {
  mounted = false
})
watch(
  () => payment.value?.pending?.interval,
  (n) => {
    if (n === 1 || n === 3) interval.value = n
  },
  { immediate: true },
)
const pendingFor = (plan: any) => payment.value?.pending?.planId === plan.id
async function resume() {
  if (payment.value?.pending?.url)
    await navigateTo(payment.value.pending.url, { external: true })
}
const offer = (plan: any) =>
  payment.value?.enabled &&
  payment.value?.canManage &&
  payment.value.offers.some(
    (v: any) => v.plan_id === plan.id && v.interval === interval.value,
  )
const subscriptionActive = computed(() =>
  payment.value?.subscriptions.some(
    (v: any) => !['expired', 'canceled'].includes(v.status),
  ),
)
async function checkout(plan: any) {
  if (paying.value || !billing?.selected.value) return
  const workspaceId = billing.selected.value,
    key = plan.id + ':' + interval.value
  paying.value = key
  paymentError.value = ''
  try {
    const result = await $fetch<{ url: string }>('/api/billing/payments', {
      method: 'POST',
      body: {
        action: 'checkout',
        workspaceId,
        planId: plan.id,
        interval: interval.value,
        requestId: crypto.randomUUID(),
      },
    })
    if (mounted && workspaceId === billing.selected.value)
      await navigateTo(result.url, { external: true })
  } catch {
    if (mounted) {
      paymentError.value = t('cloud.payments.failed')
      await payments?.refresh()
    }
  } finally {
    paying.value = ''
  }
}
</script>
<template>
  <div
    class="cf-pricing"
    :class="{ 'cf-pricing-embedded': embedded }"
  >
    <div :class="embedded ? 'cf-plan-options-heading' : 'cf-pricing-heading'">
      <p
        v-if="!embedded"
        class="cf-eyebrow"
      >
        ChronoFrame Cloud
      </p>
      <h2 v-if="embedded">{{ $t('cloud.billing.choosePlan') }}</h2>
      <h1 v-else>{{ $t('cloud.billing.pricing') }}</h1>
      <p>
        {{
          $t(
            embedded
              ? 'cloud.billing.optionsHelp'
              : 'cloud.billing.pricingHelp',
          )
        }}
      </p>
      <CfRadioGroup
        v-model="billingPeriod"
        :label="$t('cloud.billing.interval')"
        :options="
          [1, 3].map((n) => ({
            value: String(n),
            label: $t('cloud.billing.' + (n === 1 ? 'monthly' : 'quarterly')),
            disabled: portal && !!payment?.pending,
          }))
        "
      />
      <p class="cf-field-hint">
        {{
          payment?.enabled
            ? $t('cloud.payments.testHelp')
            : $t('cloud.billing.paymentsPlanned')
        }}
      </p>
      <p
        v-if="paymentError"
        class="cf-error-message"
        role="alert"
      >
        {{ paymentError }}
      </p>
    </div>
    <template v-if="billing && !embedded">
      <p
        v-if="billing.error.value"
        role="alert"
        class="cf-notice"
      >
        {{ $t('cloud.billing.failed') }}
        <CfButton
          variant="ghost"
          @click="billing.retry"
          >{{ $t('cloud.billing.retry') }}</CfButton
        >
      </p>
      <p
        v-else-if="billing.data.value"
        class="cf-field-hint cf-pricing-current"
      >
        {{ $t('cloud.billing.current') }}: {{ billing.data.value.plan.name }}
      </p>
    </template>
    <CfCard
      v-if="error"
      role="alert"
      ><p>{{ $t('cloud.billing.failed') }}</p>
      <CfButton @click="refresh">{{
        $t('cloud.billing.retry')
      }}</CfButton></CfCard
    ><template v-else-if="data"
      ><div class="cf-pricing-grid">
        <article
          v-for="plan in data.plans"
          :key="plan.id"
          class="cf-pricing-card"
          :class="{
            'is-featured': plan.featured && !embedded,
            'is-current': portal && plan.id === currentPlan,
          }"
        >
          <div class="cf-plan-card-heading">
            <h2>{{ plan.name }}</h2>
            <CfBadge v-if="portal && plan.id === currentPlan">{{
              $t('cloud.billing.current')
            }}</CfBadge
            ><CfBadge v-else-if="embedded && plan.featured">{{
              $t('cloud.billing.recommended')
            }}</CfBadge>
          </div>
          <p class="cf-plan-description">
            {{ plan.description || $t('cloud.billing.simplePlan') }}
          </p>
          <div class="cf-plan-price">
            <strong>{{
              amount(plan) === 0
                ? $t('cloud.billing.free')
                : price(amount(plan), plan.currency, locale)
            }}</strong
            ><span v-if="amount(plan) !== null && amount(plan) > 0"
              >/{{
                $t('cloud.billing.' + (interval === 1 ? 'month' : 'quarter'))
              }}</span
            >
          </div>
          <p class="cf-price-caption">
            {{
              amount(plan) === null
                ? $t('cloud.billing.notPriced')
                : interval === 3 && amount(plan) > 0
                  ? '≈ ' +
                    price(amount(plan)! / 3, plan.currency, locale) +
                    ' / ' +
                    $t('cloud.billing.month')
                  : $t(
                      portal
                        ? amount(plan) === 0
                          ? 'cloud.billing.noCharge'
                          : 'cloud.billing.monthlyBilling'
                        : 'cloud.billing.noCheckout',
                    )
            }}
          </p>
          <CfButton
            v-if="portal && !payment && payments?.error.value"
            variant="secondary"
            @click="payments?.refresh()"
            >{{ $t('cloud.messages.retry') }}</CfButton
          >
          <CfButton
            v-else-if="portal && !payment"
            disabled
            variant="secondary"
            >{{ $t('cloud.billing.loading') }}</CfButton
          >
          <CfButton
            v-else-if="portal && pendingFor(plan)"
            :disabled="!payment.pending.url || !!paying"
            @click="resume"
          >
            {{
              $t(
                payment.pending.url
                  ? 'cloud.payments.resume'
                  : 'cloud.payments.waiting',
              )
            }}
          </CfButton>
          <CfButton
            v-else-if="portal && plan.id === currentPlan"
            disabled
            variant="secondary"
            >{{ $t('cloud.billing.current') }}</CfButton
          >
          <CfButton
            v-else-if="portal && subscriptionActive && amount(plan) !== 0"
            :disabled="
              !payment.canManage || !!payment.pending || payments?.busy.value
            "
            variant="secondary"
            @click="payments?.portal()"
            >{{ $t('cloud.payments.manage') }}</CfButton
          >
          <CfButton
            v-else-if="portal && offer(plan)"
            :loading="paying === plan.id + ':' + interval"
            :disabled="!!paying || !!payment.pending"
            :variant="plan.featured ? 'default' : 'secondary'"
            @click="checkout(plan)"
            >{{ $t('cloud.payments.subscribe') }}</CfButton
          >
          <CfButton
            v-else-if="
              portal &&
              (billing?.data.value?.workspace.role !== 'admin' ||
                !!payment?.pending)
            "
            disabled
            :title="$t('cloud.billing.adminOnly')"
            variant="secondary"
            >{{ $t('cloud.billing.redeem') }}</CfButton
          >
          <CfButton
            v-else
            as-child
            :variant="plan.featured ? 'default' : 'secondary'"
            ><NuxtLink
              :to="action(plan)"
              :external="!portal"
              >{{
                $t(
                  !portal && plan.id === data.newPlanId
                    ? 'cloud.billing.createAccount'
                    : 'cloud.billing.redeem',
                )
              }}</NuxtLink
            ></CfButton
          >
          <ul class="cf-plan-features">
            <li
              v-for="key in BILLING_LIMITS"
              :key="key"
            >
              <span>{{ $t('cloud.billing.' + key) }}</span
              ><strong>{{
                allowance(key, plan.policy.limits[key], locale)
              }}</strong>
            </li>
          </ul>
          <details
            v-if="plan.policy.rules.length"
            class="cf-rule-details"
          >
            <summary>{{ $t('cloud.billing.conditions') }}</summary>
            <div
              v-for="(rule, index) in plan.policy.rules"
              :key="index"
            >
              <p>{{ index + 1 }}. {{ conditionText(rule.when, t) }}</p>
              <ul>
                <li
                  v-for="(value, key) in rule.limits"
                  :key="key"
                >
                  {{ $t('cloud.billing.' + key) }}:
                  {{ allowance(String(key), Number(value), locale) }}
                </li>
              </ul>
            </div>
          </details>
        </article>
      </div>
      <div
        v-if="!data.plans.length"
        class="cf-notice"
      >
        {{ $t('cloud.billing.noPlans') }}
      </div>
      <section
        v-else-if="!embedded"
        class="cf-plan-comparison"
      >
        <h2>{{ $t('cloud.billing.compare') }}</h2>
        <p class="cf-field-hint">{{ $t('cloud.billing.comparisonHelp') }}</p>
        <CfTable
          class="cf-plan-comparison-table"
          :data="comparisonRows"
          :columns="comparisonColumns"
          :aria-label="$t('cloud.billing.compare')"
        /></section
    ></template>
    <CloudLegalLinks />
  </div>
</template>
