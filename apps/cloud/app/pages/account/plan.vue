<script setup lang="ts">
import { BILLING_LIMITS, allowance } from '../../utils/billing-format'
definePageMeta({ layout: 'portal' })
const { t, locale } = useI18n(),
  links = useCloudLinks(),
  {
    workspaces,
    selected,
    data,
    error,
    listError,
    status,
    refresh,
    retry,
    ready,
  } = useWorkspaceBilling()
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
      <CloudButton
        as-child
        variant="secondary"
        ><NuxtLink :to="links.portalPricing">{{
          $t('cloud.billing.compare')
        }}</NuxtLink></CloudButton
      >
    </div>
    <label class="cf-workspace-picker"
      >{{ $t('cloud.billing.workspace')
      }}<select v-model="selected">
        <option
          v-for="w in workspaces"
          :key="w.id"
          :value="w.id"
        >
          {{ w.name }}
        </option>
      </select></label
    ><CloudCard
      v-if="error || listError"
      role="alert"
      ><p>{{ $t('cloud.billing.failed') }}</p>
      <CloudButton @click="retry">{{
        $t('cloud.billing.retry')
      }}</CloudButton></CloudCard
    ><template v-else-if="data"
      ><CloudCard class="cf-current-plan"
        ><div>
          <span class="cf-eyebrow">{{ $t('cloud.billing.current') }}</span>
          <h2>{{ data.plan.name }}</h2>
          <p>
            {{
              data.subscription.expiresAt
                ? $t('cloud.billing.expires', {
                    date: date(data.subscription.expiresAt),
                  })
                : $t('cloud.billing.noExpiry')
            }}
          </p>
          <p
            v-if="
              data.subscription.source === 'promotion' &&
              data.subscription.expiresAt !== null
            "
            class="cf-field-hint"
          >
            {{ $t('cloud.billing.signupOffer') }}
          </p>
          <p class="cf-field-hint">{{ $t('cloud.billing.noRenewal') }}</p>
        </div>
        <CloudButton
          v-if="data.workspace.role === 'admin'"
          as-child
          ><NuxtLink :to="links.redeem + '?workspaceId=' + selected">{{
            $t('cloud.billing.redeem')
          }}</NuxtLink></CloudButton
        ></CloudCard
      >
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
          <CloudButton
            variant="ghost"
            :disabled="status === 'pending'"
            @click="refresh"
            >{{ $t('cloud.billing.refresh') }}</CloudButton
          >
        </div>
        <div class="cf-quota-grid">
          <article
            v-for="key in BILLING_LIMITS"
            :key="key"
            class="cf-quota-card"
          >
            <h3>{{ $t('cloud.billing.' + key) }}</h3>
            <template v-if="key === 'byos'"
              ><p>
                <strong>{{
                  data.plan.limits.byos
                    ? $t('cloud.billing.yes')
                    : $t('cloud.billing.no')
                }}</strong>
              </p>
              <small>{{
                $t('cloud.billing.connectionCount', { count: data.usage.byos })
              }}</small></template
            >
            <p v-else-if="used(key) === null">
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
              <div
                class="cf-quota-track"
                role="progressbar"
                :aria-label="$t('cloud.billing.' + key)"
                :aria-valuemin="0"
                :aria-valuemax="100"
                :aria-valuenow="ratio(key)"
              >
                <span
                  :style="{ width: ratio(key) + '%' }"
                  :class="{ 'is-over': used(key)! > data.plan.limits[key] }"
                />
              </div>
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
        <p class="cf-field-hint">{{ $t('cloud.billing.usageHelp') }}</p>
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
      <section v-if="data.history.length">
        <h2>{{ $t('cloud.billing.history') }}</h2>
        <ol class="cf-subscription-history">
          <li
            v-for="(event, index) in data.history"
            :key="index"
          >
            <span>{{ $t('cloud.billing.event_' + event.kind) }}</span
            ><time>{{ date(event.created_at) }}</time>
          </li>
        </ol>
      </section></template
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
