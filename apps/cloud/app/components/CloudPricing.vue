<script setup lang="ts">
import {
  BILLING_LIMITS,
  allowance,
  price,
  conditionText,
} from '../utils/billing-format'
const props = withDefaults(defineProps<{ portal?: boolean }>(), {
    portal: false,
  }),
  { t, locale } = useI18n(),
  links = useCloudLinks(),
  interval = ref<1 | 3>(1),
  billing = props.portal ? useWorkspaceBilling() : null
const { data, error, refresh } = await useFetch<any>('/api/billing/catalog', {
  key: 'public-pricing-catalog',
})
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
const payment = ref<any>(),
  paying = ref(''),
  paymentError = ref('')
let paymentGeneration = 0,
  mounted = true
async function loadPayments() {
  const id = billing?.selected.value,
    generation = ++paymentGeneration
  if (!id) return
  try {
    const result = await $fetch('/api/billing/payments', {
      query: { workspaceId: id },
    })
    if (mounted && generation === paymentGeneration) payment.value = result
  } catch {
    if (mounted && generation === paymentGeneration) payment.value = null
  }
}
onMounted(() => {
  if (props.portal) void loadPayments()
})
if (billing)
  watch(billing.selected, () => {
    payment.value = null
    paymentError.value = ''
    void loadPayments()
  })
onBeforeUnmount(() => {
  mounted = false
  paymentGeneration++
})
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
      await loadPayments()
    }
  } finally {
    paying.value = ''
  }
}
</script>
<template>
  <div class="cf-pricing">
    <div class="cf-pricing-heading">
      <p class="cf-eyebrow">ChronoFrame Cloud</p>
      <h1>{{ $t('cloud.billing.pricing') }}</h1>
      <p>{{ $t('cloud.billing.pricingHelp') }}</p>
      <fieldset class="cf-billing-toggle">
        <legend class="sr-only">{{ $t('cloud.billing.interval') }}</legend>
        <label
          v-for="n in [1, 3] as const"
          :key="n"
          :class="{ active: interval === n }"
          ><input
            v-model="interval"
            type="radio"
            name="billing-interval"
            :value="n"
          /><span>{{
            $t('cloud.billing.' + (n === 1 ? 'monthly' : 'quarterly'))
          }}</span></label
        >
      </fieldset>
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
    <CloudPaymentsPanel
      v-if="portal && billing?.selected.value"
      :workspace-id="billing.selected.value"
    />
    <template v-if="billing">
      <label class="cf-workspace-picker"
        >{{ $t('cloud.billing.workspace')
        }}<select v-model="billing.selected.value">
          <option
            v-for="workspace in billing.workspaces.value"
            :key="workspace.id"
            :value="workspace.id"
          >
            {{ workspace.name }}
          </option>
        </select></label
      >
      <p
        v-if="billing.error.value"
        role="alert"
        class="cf-notice"
      >
        {{ $t('cloud.billing.failed') }}
        <CloudButton
          variant="ghost"
          @click="billing.retry"
          >{{ $t('cloud.billing.retry') }}</CloudButton
        >
      </p>
      <p
        v-else-if="billing.data.value"
        class="cf-field-hint cf-pricing-current"
      >
        {{ $t('cloud.billing.current') }}: {{ billing.data.value.plan.name }}
      </p>
    </template>
    <CloudCard
      v-if="error"
      role="alert"
      ><p>{{ $t('cloud.billing.failed') }}</p>
      <CloudButton @click="refresh">{{
        $t('cloud.billing.retry')
      }}</CloudButton></CloudCard
    ><template v-else-if="data"
      ><div class="cf-pricing-grid">
        <article
          v-for="plan in data.plans"
          :key="plan.id"
          class="cf-pricing-card"
          :class="{ 'is-featured': plan.featured }"
        >
          <div class="cf-plan-card-heading">
            <h2>{{ plan.name }}</h2>
            <CloudBadge v-if="portal && plan.id === currentPlan">{{
              $t('cloud.billing.current')
            }}</CloudBadge>
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
                  : $t('cloud.billing.noCheckout')
            }}
          </p>
          <CloudButton
            v-if="portal && offer(plan)"
            :loading="paying === plan.id + ':' + interval"
            :disabled="!!paying || !!payment.pending || subscriptionActive"
            :variant="plan.featured ? 'default' : 'secondary'"
            @click="checkout(plan)"
            >{{
              subscriptionActive
                ? $t('cloud.payments.manageExisting')
                : $t('cloud.payments.subscribe')
            }}</CloudButton
          >
          <CloudButton
            v-else-if="
              portal && billing?.data.value?.workspace.role !== 'admin'
            "
            disabled
            :title="$t('cloud.billing.adminOnly')"
            :variant="plan.featured ? 'default' : 'secondary'"
            >{{ $t('cloud.billing.redeem') }}</CloudButton
          >
          <CloudButton
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
            ></CloudButton
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
        v-else
        class="cf-plan-comparison"
      >
        <h2>{{ $t('cloud.billing.compare') }}</h2>
        <p class="cf-field-hint">{{ $t('cloud.billing.comparisonHelp') }}</p>
        <div class="cf-table-scroll">
          <table>
            <caption class="sr-only">
              {{
                $t('cloud.billing.compare')
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ $t('cloud.billing.allowance') }}</th>
                <th
                  v-for="plan in data.plans"
                  :key="plan.id"
                  scope="col"
                >
                  {{ plan.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="key in BILLING_LIMITS"
                :key="key"
              >
                <th scope="row">{{ $t('cloud.billing.' + key) }}</th>
                <td
                  v-for="plan in data.plans"
                  :key="plan.id"
                >
                  {{ allowance(key, plan.policy.limits[key], locale) }}
                </td>
              </tr>
              <tr>
                <th scope="row">{{ $t('cloud.billing.conditions') }}</th>
                <td
                  v-for="plan in data.plans"
                  :key="plan.id"
                >
                  {{ plan.policy.rules.length || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section></template
    >
  </div>
</template>
