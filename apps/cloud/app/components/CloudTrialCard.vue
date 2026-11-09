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
    if (value) offset.value = value.serverTime - Date.now()
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
  <CfCard
    v-else-if="visible && data"
    class="cloud-trial-card"
  >
    <div class="cloud-trial-heading">
      <div>
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
          v-if="active"
          class="cf-field-hint"
        >
          {{ t('cloud.trial.remainingDays', { days: daysLeft }) }}
        </p>
        <p
          v-else-if="!trial && !data.eligible"
          class="cf-field-hint"
        >
          {{ reason }}
        </p>
      </div>
      <CfButton
        v-if="data.eligible"
        size="sm"
        @click="open = true"
        >{{ t('cloud.trial.viewOffer') }}</CfButton
      >
      <CfButton
        v-else-if="!trial || trial.state !== 'converted'"
        size="sm"
        variant="secondary"
        to="/pricing?portal=1"
        >{{ t('cloud.trial.viewPlans') }}</CfButton
      >
    </div>
    <p
      v-if="trial && active"
      class="cf-field-hint"
    >
      {{ t('cloud.trial.endsAt', { date: endDate }) }}
    </p>
    <template v-if="data.eligible && data.offer">
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
      <p class="cf-field-hint">{{ t('cloud.trial.noPayment') }}</p>
    </template>
  </CfCard>
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
.cloud-trial-card,
.cloud-trial-confirm {
  display: grid;
  gap: 14px;
  padding: 20px;
  min-width: 0;
}
.cloud-trial-confirm {
  padding: 0;
  font-size: 13px;
}
.cloud-trial-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.cloud-trial-heading h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
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
</style>
