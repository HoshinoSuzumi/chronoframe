<script setup lang="ts">
import { allowance as formatAllowance } from '../utils/billing-format'
const props = defineProps<{
  allowance: {
    plan: { name: string }
    storageBytes: number
    limits: Record<string, number>
  } | null
  error?: string
}>()
const { t, locale } = useI18n()
const used = computed(() => Math.max(0, props.allowance?.storageBytes ?? 0))
const total = computed(() =>
  Math.max(0, props.allowance?.limits.storageBytes ?? 0),
)
const percent = computed(() =>
  total.value > 0
    ? Math.min(100, (used.value / total.value) * 100)
    : used.value > 0
      ? 100
      : 0,
)
const bytes = (value: number) =>
  formatAllowance('storageBytes', value, locale.value)
</script>
<template>
  <CfCard class="p-5 sm:p-6">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div
          class="flex size-9 items-center justify-center rounded-md bg-muted text-muted"
        >
          <UIcon
            name="i-lucide-hard-drive"
            class="size-5"
          />
        </div>
        <h2 class="text-sm font-semibold">
          {{ t('cloud.messages.platformStorage') }}
        </h2>
      </div>
      <UBadge
        v-if="allowance"
        color="neutral"
        variant="subtle"
        >{{ allowance.plan.name }}</UBadge
      ><USkeleton
        v-else
        class="h-5 w-16"
      />
    </div>
    <div
      v-if="allowance"
      class="mt-5 grid gap-3"
    >
      <p class="text-xs text-muted">{{ t('cloud.storageAllowance.used') }}</p>
      <div
        class="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2"
      >
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <strong class="text-2xl font-semibold tabular-nums">{{
            bytes(used)
          }}</strong
          ><span class="text-sm text-muted">{{
            t('cloud.dashboard.ofLimit', { limit: bytes(total) })
          }}</span>
        </div>
        <span class="text-xs text-muted tabular-nums">{{
          t('cloud.billing.remaining', {
            value: bytes(Math.max(0, total - used)),
          })
        }}</span>
      </div>
      <CfProgress
        :value="percent"
        :aria-label="t('cloud.messages.platformStorage')"
      />
      <p
        v-if="used > total"
        class="text-xs text-error"
      >
        {{ t('cloud.billing.overQuota') }}
      </p>
    </div>
    <p
      v-else-if="error"
      role="status"
      class="mt-5 text-sm text-muted"
    >
      {{ t('cloud.dashboard.quotaUnavailable') }}
    </p>
    <div
      v-else
      class="mt-5 grid gap-3"
      aria-busy="true"
    >
      <USkeleton class="h-7 w-44" /><USkeleton class="h-1 w-full" />
    </div>
  </CfCard>
</template>
