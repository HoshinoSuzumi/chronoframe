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
  interval = ref<1 | 3>(1)
const { data, error, refresh } = await useFetch<any>('/api/billing/catalog', {
  key: 'public-pricing-catalog',
})
const amount = (plan: any) =>
  interval.value === 1 ? plan.monthlyPrice : plan.quarterlyPrice
const action = (plan: any) =>
  !props.portal && plan.id === data.value?.newPlanId
    ? links.signup
    : links.redeem
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
      <p class="cf-field-hint">{{ $t('cloud.billing.paymentsPlanned') }}</p>
    </div>
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
          :class="{ 'is-default': plan.id === data.newPlanId }"
        >
          <div class="cf-plan-card-heading">
            <h2>{{ plan.name }}</h2>
            <CloudBadge v-if="plan.id === data.newPlanId">{{
              $t('cloud.billing.defaultTier')
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
            as-child
            :variant="plan.id === data.newPlanId ? 'default' : 'secondary'"
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
