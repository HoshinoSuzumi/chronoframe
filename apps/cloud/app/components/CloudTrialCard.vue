<script setup lang="ts">
import type { WorkspaceTrial } from '@chronoframe/contracts/platform-setup'
import { allowance } from '../utils/billing-format'
const props = defineProps<{
  workspaceId: number
  workspaceName?: string
  currentLimits?: Record<string, number>
  currentAnalytics?: boolean
  subscription?: string
  showUnavailable?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const identity = usePortalIdentity()
const fetcher = useRequestFetch()
const request = useAsyncData(
  () => `workspace-trial-${identity.value?.id}-${props.workspaceId}`,
  async () => {
    const workspaceId = props.workspaceId
    const accountId = identity.value?.id
    if (!workspaceId) return null
    const value = await fetcher<WorkspaceTrial>('/api/billing/trial', {
      query: { workspaceId },
      timeout: 15000,
    })
    return { workspaceId, accountId, value }
  },
  { watch: [() => props.workspaceId, () => props.subscription] },
)
// Nuxt may retain cached data while a reactive request key is changing.
const data = computed(() => {
  const loaded = request.data.value
  return loaded?.workspaceId === props.workspaceId &&
    loaded.accountId === identity.value?.id
    ? loaded.value
    : null
})
const open = ref(false),
  busy = ref(false),
  error = ref('')
let claimGeneration = 0
watch([() => props.workspaceId, () => identity.value?.id], () => {
  claimGeneration++
  open.value = false
  busy.value = false
  error.value = ''
})
const clock = ref(Date.now()),
  offset = ref(0)
watch(
  data,
  (value) => {
    if (value) {
      const now = Date.now()
      clock.value = now
      offset.value = value.serverTime - now
    }
  },
  { immediate: true },
)
useIntervalFn(() => {
  clock.value = Date.now()
}, 15000)
const trial = computed(() =>
  data.value?.trial?.workspaceId === props.workspaceId
    ? data.value.trial
    : null,
)
const daysLeft = computed(() =>
  trial.value
    ? Math.max(
        0,
        Math.ceil(
          (trial.value.expiresAt - clock.value - offset.value) / 86400000,
        ),
      )
    : 0,
)
const active = computed(
  () => trial.value?.state === 'active' && daysLeft.value > 0,
)
const visible = computed(
  () =>
    !!data.value &&
    (data.value.eligible ||
      !!trial.value ||
      (!!props.showUnavailable &&
        !!data.value.offer &&
        !['disabled', 'not_started', 'ended', 'not_owner'].includes(
          data.value.reason ?? '',
        ))),
)
const benefits = computed(() =>
  Object.entries(data.value?.offer?.limits ?? {}).filter(
    ([key, value]) => value !== (props.currentLimits?.[key] ?? 0),
  ),
)
const previewBenefits = computed(() => {
  const priority = ['storageBytes', 'photos', 'sites']
  return [...benefits.value]
    .sort(([a], [b]) => {
      const rank = (key: string) =>
        priority.includes(key) ? priority.indexOf(key) : priority.length
      return rank(a) - rank(b)
    })
    .slice(0, 3)
})
const endDate = computed(() =>
  trial.value
    ? new Intl.DateTimeFormat(locale.value === 'en' ? 'en' : 'zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(trial.value.expiresAt)
    : '',
)
const reason = computed(() =>
  t('cloud.trial.reasons.' + (data.value?.reason ?? 'disabled')),
)
/** Confirm the current offer without letting late responses replace another workspace. */
async function claim() {
  if (busy.value || !data.value?.eligible || !data.value.offer) return
  const generation = ++claimGeneration
  const workspaceId = props.workspaceId
  const accountId = identity.value?.id
  const current = () =>
    generation === claimGeneration &&
    workspaceId === props.workspaceId &&
    accountId === identity.value?.id
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch<WorkspaceTrial>('/api/billing/trial', {
      method: 'POST',
      body: {
        workspaceId,
        revision: data.value.offer.revision,
        confirmed: true,
      },
      timeout: 20000,
    })
    if (!current()) return
    request.data.value = { workspaceId, accountId, value: result }
    open.value = false
    clock.value = Date.now()
    emit('changed')
    await refreshNuxtData(
      (key) =>
        key.startsWith('quota-') || key.startsWith('cloud-site-subscription-'),
    )
  } catch {
    if (!current()) return
    error.value = t('cloud.trial.claimFailed')
    await request.refresh()
  } finally {
    if (current()) busy.value = false
  }
}
</script>
<template>
  <CfAlert
    v-if="request.error.value"
    tone="error"
    >{{ t('cloud.trial.loadFailed')
    }}<template #actions
      ><CfButton
        size="sm"
        variant="secondary"
        @click="request.refresh()"
        >{{ t('cloud.messages.retry') }}</CfButton
      ></template
    ></CfAlert
  >
  <CfBorderGlow
    v-else-if="visible && data"
    :active="data.eligible || active"
    :animated="data.eligible"
    class="cloud-trial-card"
  >
    <div class="cloud-trial-layout">
      <div class="cloud-trial-summary">
        <div class="cloud-trial-eyebrow">
          <UIcon
            :name="
              active
                ? 'i-lucide-sparkles'
                : data.eligible
                  ? 'i-lucide-gift'
                  : trial?.state === 'converted'
                    ? 'i-lucide-circle-check'
                    : 'i-lucide-circle-minus'
            "
            aria-hidden="true"
          />
          {{ t('cloud.trial.label') }}
          <span
            v-if="active"
            class="cloud-trial-status"
            >{{ t('cloud.trial.inProgress') }}</span
          >
        </div>
        <h2>
          {{
            active
              ? t('cloud.trial.activeTitle', { plan: trial?.planName })
              : data.eligible
                ? t('cloud.trial.offerTitle', {
                    plan: data.offer?.planName,
                    days: data.offer?.days,
                  })
                : t(
                    'cloud.trial.' +
                      (trial?.state === 'converted'
                        ? 'converted'
                        : trial?.state === 'revoked'
                          ? 'revoked'
                          : trial
                            ? 'ended'
                            : 'unavailable'),
                  )
          }}
        </h2>
        <p
          v-if="!trial && !data.eligible"
          class="cloud-trial-description"
        >
          {{ reason }}
        </p>
      </div>
      <div
        v-if="active && trial"
        class="cloud-trial-countdown"
      >
        <p class="cloud-trial-days">
          <strong>{{ daysLeft }}</strong
          ><span>{{ t('cloud.trial.days') }}</span>
        </p>
        <CfProgress
          :value="
            Math.max(
              0,
              Math.min(
                100,
                ((trial.expiresAt - clock - offset) /
                  Math.max(1, trial.expiresAt - trial.startedAt)) *
                  100,
              ),
            )
          "
          :aria-label="t('cloud.trial.remainingDays', { days: daysLeft })"
        />
        <p class="cloud-trial-expiry">
          {{ t('cloud.trial.endsAt', { date: endDate }) }}
        </p>
      </div>
      <div
        v-else-if="data.eligible && data.offer && previewBenefits.length"
        class="cloud-trial-upgrades"
      >
        <dl class="cloud-trial-metrics">
          <div
            v-for="[key, value] in previewBenefits"
            :key="key"
            class="cloud-trial-metric"
          >
            <dt>{{ t('cloud.billing.' + key) }}</dt>
            <dd>
              <span class="cloud-trial-previous">{{
                allowance(key, currentLimits?.[key] ?? 0, locale)
              }}</span
              ><span class="cloud-trial-arrow"> → </span
              ><strong>{{ allowance(key, value, locale) }}</strong>
            </dd>
          </div>
        </dl>
      </div>
      <div class="cloud-trial-actions">
        <CfButton
          v-if="data.eligible"
          size="sm"
          @click="open = true"
        >
          {{ t('cloud.trial.start', { days: data.offer?.days }) }}
          <UIcon
            name="i-lucide-arrow-up-right"
            aria-hidden="true"
          />
        </CfButton>
        <CfButton
          v-else-if="!trial || trial.state !== 'converted'"
          size="sm"
          variant="secondary"
          to="/pricing?portal=1"
          >{{ t('cloud.trial.viewPlans') }}</CfButton
        >
        <span
          v-if="data.eligible"
          class="cloud-trial-reassurance"
          >{{ t('cloud.trial.noPayment') }}</span
        >
      </div>
    </div>
  </CfBorderGlow>
  <UModal
    v-model:open="open"
    :dismissible="!busy"
    :close="!busy"
    :title="t('cloud.trial.confirmTitle')"
    :description="workspaceName || ''"
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body
      ><div
        v-if="data?.offer"
        class="cloud-trial-confirm"
      >
        <p>
          {{
            t('cloud.trial.confirmTerm', {
              plan: data.offer.planName,
              days: data.offer.days,
            })
          }}
        </p>
        <ul class="cloud-trial-benefits">
          <li
            v-for="[key, value] in benefits"
            :key="key"
          >
            {{ t('cloud.billing.' + key) }}
            {{ allowance(key, currentLimits?.[key] ?? 0, locale) }} →
            {{ allowance(key, value, locale) }}
          </li>
          <li v-if="data.offer.analytics !== !!currentAnalytics">
            {{ t('cloud.billing.analytics') }}:
            {{
              t(
                data.offer.analytics
                  ? 'cloud.trial.included'
                  : 'cloud.trial.notIncluded',
              )
            }}
          </li>
        </ul>
        <p>{{ t('cloud.trial.noPayment') }}</p>
        <p>{{ t('cloud.trial.once') }}</p>
        <p>{{ t('cloud.trial.afterTrial', { plan: data.fallback.name }) }}</p>
        <p class="cf-field-hint">{{ t('cloud.trial.domainExpiry') }}</p>
        <p
          v-if="!data.eligible"
          role="alert"
        >
          {{ reason }}
        </p>
        <p
          v-if="error"
          role="alert"
          class="cf-field-error"
        >
          {{ error }}
        </p>
      </div></template
    >
    <template #footer
      ><CfButton
        variant="secondary"
        :disabled="busy"
        @click="open = false"
        >{{ t('cloud.trial.cancel') }}</CfButton
      ><CfButton
        :disabled="busy || !data?.eligible"
        :loading="busy"
        @click="claim"
        >{{ t('cloud.trial.start', { days: data?.offer?.days }) }}</CfButton
      ></template
    >
  </UModal>
</template>
<style scoped>
.cloud-trial-layout {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 18px 22px;
  min-width: 0;
}
.cloud-trial-summary {
  flex: 1;
  min-width: 0;
}
.cloud-trial-eyebrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--accent);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 5px;
}
.cloud-trial-eyebrow :deep(.iconify) {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
.cloud-trial-status {
  color: var(--success);
  font-size: 10px;
  letter-spacing: 0;
}
.cloud-trial-status::before {
  content: '·';
  margin-right: 6px;
}
.cloud-trial-summary h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.cloud-trial-description {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
}
.cloud-trial-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.cloud-trial-reassurance {
  font-size: 10px;
  color: var(--muted-foreground);
}
.cloud-trial-upgrades {
  min-width: 0;
}
.cloud-trial-metrics {
  display: flex;
  gap: 24px;
  margin: 0;
}
.cloud-trial-metric {
  min-width: 0;
}
.cloud-trial-metric dt {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-bottom: 4px;
}
.cloud-trial-metric dd {
  margin: 0;
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.cloud-trial-metric strong {
  font-size: 14px;
  font-weight: 600;
}
.cloud-trial-previous,
.cloud-trial-arrow {
  color: var(--muted-foreground);
}
.cloud-trial-arrow {
  padding: 0 2px;
}
.cloud-trial-countdown {
  display: grid;
  grid-template-columns: auto minmax(100px, 1fr);
  align-items: center;
  gap: 4px 14px;
  min-width: 0;
}
.cloud-trial-days {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 0;
  grid-row: span 2;
}
.cloud-trial-days strong {
  font-size: 30px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
}
.cloud-trial-days span {
  font-size: 12px;
  color: var(--muted-foreground);
}
.cloud-trial-expiry {
  margin: 0;
  font-size: 11px;
  color: var(--muted-foreground);
}
.cloud-trial-actions:empty {
  display: none;
}
.cloud-trial-confirm {
  display: grid;
  gap: 14px;
  min-width: 0;
  font-size: 13px;
}
.cloud-trial-benefits {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 0;
  margin: 0;
  list-style: none;
  font-size: 13px;
  color: var(--muted-foreground);
}
@media (max-width: 1100px) {
  .cloud-trial-layout {
    flex-wrap: wrap;
    gap: 16px 24px;
  }
  .cloud-trial-summary {
    flex-basis: 45%;
  }
  .cloud-trial-upgrades {
    order: 3;
    flex-basis: 100%;
  }
  .cloud-trial-metrics {
    gap: 24px;
  }
}
@media (max-width: 600px) {
  .cloud-trial-layout {
    padding: 16px;
    gap: 14px;
  }
  .cloud-trial-summary {
    flex-basis: 100%;
  }
  .cloud-trial-actions {
    align-items: flex-start;
    order: 4;
  }
  .cloud-trial-metrics {
    flex-wrap: wrap;
    gap: 12px 20px;
  }
  .cloud-trial-countdown {
    flex-basis: 100%;
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
