<script setup lang="ts">
import { planPurchasePath } from '../utils/plan-purchase'
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
const route = useRoute()
const requestedPurchase = computed(() =>
  planPurchasePath(route.query.plan, route.query.interval),
)
const { t, locale } = useI18n(),
  links = useCloudLinks(),
  interval = ref<1 | 3>(
    requestedPurchase.value && route.query.interval === '1' ? 1 : 3,
  )
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
    useCloudPayments(
      () => billing?.selected.value ?? 0,
      async () => {
        await billing?.refresh()
      },
    ))
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
const comparisonRows = computed(() => {
  const plans = data.value?.plans ?? []
  const labels = [
    ...new Set<string>(
      plans.flatMap((plan: any) =>
        (plan.policy.features ?? []).map((f: any) => f.label),
      ),
    ),
  ]
  return [...BILLING_LIMITS, 'conditions']
    .map((key) => ({
      key: String(key),
      label: t('cloud.billing.' + key),
      values: Object.fromEntries(
        (data.value?.plans ?? []).map((plan: any) => [
          plan.id,
          key === 'conditions'
            ? String(plan.policy.rules.length || '—')
            : allowance(key, plan.policy.limits[key], locale.value),
        ]),
      ),
    }))
    .concat(
      labels.map((label) => ({
        key: 'feature:' + label,
        label,
        values: Object.fromEntries(
          plans.map((plan: any) => [
            plan.id,
            plan.policy.features?.find((f: any) => f.label === label) ?? {
              type: 'dash',
            },
          ]),
        ),
      })),
    )
})
if (billing) await billing.ready
const currentPlan = computed(() => billing?.data.value?.plan.id)
const originalAmount = (plan: any) =>
  interval.value === 1 ? plan.monthlyPrice : plan.quarterlyPrice
const amount = (plan: any) =>
  interval.value === 1
    ? (plan.monthlyEffectivePrice ?? plan.monthlyPrice)
    : (plan.quarterlyEffectivePrice ?? plan.quarterlyPrice)
const discountBps = (plan: any) =>
  interval.value === 1
    ? (plan.monthlyDiscountBps ?? 0)
    : (plan.quarterlyDiscountBps ?? 0)
const action = (plan: any) =>
  amount(plan) === 0 ? links.signup : links.purchase(plan.id, interval.value)
const payment = computed(() => payments?.data.value),
  paying = ref(''),
  paymentError = ref('')
const redeemOnly = computed(
  () =>
    (props.portal
      ? (payment.value?.purchaseMethod ?? data.value?.purchaseMethod)
      : data.value?.purchaseMethod) === 'activation_code',
)
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
  else await Promise.all([payments?.refresh(), billing?.refresh()])
}
const offer = (plan: any) =>
  payment.value?.enabled &&
  payment.value?.canManage &&
  !payment.value?.hasActiveSubscription &&
  payment.value.offers.some(
    (v: any) => v.plan_id === plan.id && v.interval === interval.value,
  )
const changeQuote = ref<any>(null),
  changeOpen = ref(false),
  changeBusy = ref(false),
  changeError = ref('')
const changeFor = (plan: any) =>
  payment.value?.enabled &&
  payment.value?.canManage &&
  !payment.value?.planChange &&
  payment.value?.changes?.find(
    (c: any) => c.planId === plan.id && c.interval === interval.value,
  )
async function previewChange(plan: any) {
  if (changeBusy.value || !billing?.selected.value) return
  changeBusy.value = true
  changeError.value = ''
  changeQuote.value = null
  changeOpen.value = true
  try {
    changeQuote.value = await $fetch('/api/billing/payments', {
      method: 'POST',
      timeout: 15000,
      body: {
        action: 'preview-change',
        workspaceId: billing.selected.value,
        planId: plan.id,
      },
    })
  } catch {
    changeError.value = t('cloud.payments.changeFailed')
  } finally {
    changeBusy.value = false
  }
}
async function confirmChange() {
  if (changeBusy.value || !changeQuote.value || !billing?.selected.value) return
  changeBusy.value = true
  changeError.value = ''
  try {
    await $fetch('/api/billing/payments', {
      method: 'POST',
      timeout: 25000,
      body: {
        action: 'change-plan',
        workspaceId: billing.selected.value,
        quoteId: changeQuote.value.id,
      },
    })
    changeOpen.value = false
  } catch {
    changeError.value = t('cloud.payments.changeFailed')
  } finally {
    await Promise.all([
      payments?.refresh({ reconcile: false }),
      billing?.refresh(),
    ])
    changeBusy.value = false
  }
}
watch(
  () => billing?.selected.value,
  () => {
    changeOpen.value = false
    changeQuote.value = null
  },
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
          portal && !redeemOnly && payment?.environment === 'test'
            ? $t('cloud.payments.testHelp')
            : $t('cloud.billing.purchaseHelp')
        }}
      </p>
      <p
        v-if="payment?.planChange"
        class="cf-notice"
        role="status"
      >
        {{
          $t(
            payment.planChange.state === 'scheduled'
              ? 'cloud.payments.changeScheduled'
              : 'cloud.payments.changePending',
          )
        }}
        <CfButton
          variant="ghost"
          :disabled="payments?.busy.value"
          @click="payments?.refresh()"
          >{{ $t('cloud.payments.checkAgain') }}</CfButton
        >
      </p>
      <p
        v-if="payment?.pending?.state === 'uncertain'"
        class="cf-field-hint"
        role="status"
      >
        {{ $t('cloud.payments.confirmationReview') }}
        <code
          v-if="
            payment.pending.error &&
            payment.pending.error !== 'payment_confirmation_pending'
          "
          >{{ payment.pending.error }}</code
        >
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
          :id="'plan-' + plan.id"
          tabindex="-1"
          class="cf-pricing-card"
          :class="{
            'is-featured': plan.featured && !embedded,
            'is-current': portal && plan.id === currentPlan,
          }"
        >
          <span
            v-if="discountBps(plan) > 0 && originalAmount(plan) > 0"
            class="cf-plan-discount-ribbon"
            >−{{
              new Intl.NumberFormat(locale, {
                maximumFractionDigits: 2,
              }).format(discountBps(plan) / 100)
            }}%</span
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
          <p class="cf-plan-original-price">
            <del v-if="discountBps(plan) > 0 && originalAmount(plan) > 0">{{
              price(
                originalAmount(plan) === null
                  ? null
                  : originalAmount(plan) / interval,
                plan.currency,
                locale,
              )
            }}</del>
          </p>
          <div class="cf-plan-price">
            <strong>{{
              amount(plan) === 0
                ? $t('cloud.billing.free')
                : price(
                    amount(plan) === null ? null : amount(plan) / interval,
                    plan.currency,
                    locale,
                  )
            }}</strong
            ><span v-if="amount(plan) !== null && amount(plan) > 0"
              >/{{ $t('cloud.billing.month') }}</span
            >
          </div>
          <p class="cf-price-caption">
            {{
              amount(plan) === null
                ? $t('cloud.billing.notPriced')
                : interval === 3 && amount(plan) > 0
                  ? price(amount(plan), plan.currency, locale) +
                    ' / ' +
                    $t('cloud.billing.quarter')
                  : $t(
                      amount(plan) === 0
                        ? 'cloud.billing.noCharge'
                        : 'cloud.billing.monthlyBilling',
                    )
            }}
          </p>
          <CfButton
            v-if="redeemOnly"
            as-child
            :variant="plan.featured ? 'default' : 'secondary'"
            ><NuxtLink
              :to="links.redeem"
              :external="!portal"
              >{{ $t('cloud.billing.redeem') }}</NuxtLink
            ></CfButton
          >
          <CfButton
            v-else-if="portal && !payment && payments?.error.value"
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
            :disabled="
              !!paying ||
              payments?.busy.value ||
              (!payment.pending.url && !payment.pending.canRefresh)
            "
            @click="resume"
          >
            {{
              $t(
                payment.pending.url
                  ? 'cloud.payments.resume'
                  : 'cloud.payments.checkAgain',
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
            v-else-if="portal && changeFor(plan)"
            :disabled="changeBusy || !!payment.pending"
            :variant="plan.featured ? 'default' : 'secondary'"
            @click="previewChange(plan)"
            >{{
              $t(
                changeFor(plan).direction === 'upgrade'
                  ? 'cloud.payments.upgrade'
                  : 'cloud.payments.downgrade',
              )
            }}</CfButton
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
            v-else-if="portal"
            disabled
            variant="secondary"
            :title="
              billing?.data.value?.workspace.role !== 'admin'
                ? $t('cloud.billing.adminOnly')
                : $t('cloud.billing.purchaseUnavailableHelp')
            "
            >{{
              billing?.data.value?.workspace.role !== 'admin'
                ? $t('cloud.billing.adminOnly')
                : $t('cloud.billing.purchaseUnavailable')
            }}</CfButton
          >
          <CfButton
            v-else-if="amount(plan) === null"
            disabled
            variant="secondary"
            >{{ $t('cloud.billing.notPriced') }}</CfButton
          >
          <CfButton
            v-else
            as-child
            :variant="plan.featured ? 'default' : 'secondary'"
            ><NuxtLink
              :to="action(plan)"
              external
              >{{
                amount(plan) === 0
                  ? $t('cloud.billing.createAccount')
                  : $t('cloud.billing.buyPlan', { plan: plan.name })
              }}</NuxtLink
            ></CfButton
          >
          <ul class="cf-plan-features">
            <li
              v-for="key in BILLING_LIMITS"
              :key="key"
            >
              <span>{{ $t('cloud.billing.' + key) }}</span
              ><strong
                ><UIcon
                  v-if="key === 'byos'"
                  :name="
                    plan.policy.limits[key]
                      ? 'i-lucide-check'
                      : 'i-lucide-minus'
                  "
                  :aria-label="
                    $t(
                      'cloud.billing.' +
                        (plan.policy.limits[key] ? 'yes' : 'no'),
                    )
                  "
                  role="img"
                /><template v-else>{{
                  allowance(key, plan.policy.limits[key], locale)
                }}</template></strong
              >
            </li>
            <li
              v-for="(feature, index) in plan.policy.features ?? []"
              :key="'feature:' + index"
            >
              <span>{{ feature.label }}</span
              ><strong><CloudPlanFeatureValue :feature="feature" /></strong>
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
                  <CloudPlanFeatureValue
                    v-if="key === 'byos'"
                    :feature="{ type: value ? 'supported' : 'dash' }"
                  /><template v-else>{{
                    allowance(String(key), Number(value), locale)
                  }}</template>
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
          :caption="$t('cloud.billing.compare')"
          ><template
            v-for="plan in data.plans"
            :key="plan.id"
            #[`plan:${plan.id}-cell`]="{ row }"
          >
            <CloudPlanFeatureValue
              v-if="row.original.key.startsWith('feature:')"
              :feature="row.original.values[plan.id]"
            />
            <CloudPlanFeatureValue
              v-else-if="row.original.key === 'byos'"
              :feature="{
                type: plan.policy.limits.byos ? 'supported' : 'dash',
              }"
            />
            <template v-else>{{ row.original.values[plan.id] }}</template>
          </template></CfTable
        >
      </section></template
    >
    <div class="cf-pricing-footer">
      <CloudSupportLink /><NuxtLink
        :to="links.redeem"
        :external="!portal"
        >{{ $t('cloud.billing.redeem') }}</NuxtLink
      >
    </div>
    <UModal
      v-model:open="changeOpen"
      :title="$t('cloud.payments.changeTitle')"
      :dismissible="!changeBusy"
      :close="!changeBusy"
    >
      <template #body
        ><div class="cf-form">
          <p
            v-if="changeBusy && !changeQuote"
            role="status"
          >
            {{ $t('cloud.billing.loading') }}
          </p>
          <template v-if="changeQuote">
            <p>
              {{
                $t(
                  changeQuote.direction === 'upgrade'
                    ? 'cloud.payments.upgradeHelp'
                    : 'cloud.payments.downgradeHelp',
                )
              }}
            </p>
            <p>
              {{ $t('cloud.payments.chargeNow') }}
              <strong>{{
                price(
                  changeQuote.charge.total_amount,
                  changeQuote.charge.currency,
                  locale,
                )
              }}</strong>
            </p>
            <p>
              {{ $t('cloud.payments.newRecurring') }}
              <strong>{{
                price(changeQuote.renewalAmount, changeQuote.currency, locale)
              }}</strong>
              /
              {{
                $t(
                  changeQuote.interval === 1
                    ? 'cloud.billing.month'
                    : 'cloud.billing.quarter',
                )
              }}
            </p>
            <p class="cf-field-hint">{{ $t('cloud.payments.savedMethod') }}</p>
          </template>
          <p
            v-if="changeError"
            class="cf-error-message"
            role="alert"
          >
            {{ changeError }}
          </p>
        </div></template
      >
      <template #footer
        ><CfButton
          :disabled="changeBusy || !changeQuote"
          :loading="changeBusy"
          @click="confirmChange"
          >{{ $t('cloud.payments.confirmChange') }}</CfButton
        ></template
      >
    </UModal>
    <CloudLegalLinks />
  </div>
</template>
