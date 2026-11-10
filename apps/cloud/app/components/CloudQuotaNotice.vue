<script setup lang="ts">
const props = defineProps<{
  reason: string
  error?: boolean
  resource?: string
}>()
const identity = usePortalIdentity()
const fetcher = useRequestFetch()
const offer = useAsyncData(
  () => `quota-trial-offer-${identity.value?.id}-${props.reason}`,
  async () => {
    if (props.reason !== 'upgrade') return null
    const { workspaces } = await fetcher<{
      workspaces: { id: number; owned?: number }[]
    }>('/api/billing/workspaces')
    const workspace = workspaces.find((item) => item.owned)
    return workspace
      ? fetcher<import('@chronoframe/contracts/platform-setup').WorkspaceTrial>(
          '/api/billing/trial',
          { query: { workspaceId: workspace.id } },
        )
      : null
  },
  { watch: [() => props.reason] },
)
const plansLink = computed(() =>
  offer.data.value?.reason === 'disabled'
    ? '/account/plan#plans'
    : '/account/plan',
)
const emit = defineEmits<{ retry: [] }>()
</script>
<template>
  <CfAlert
    v-if="reason || error"
    class="cf-quota-notice"
    :tone="error ? 'error' : 'info'"
    ><div>
      <strong>{{
        $t(
          error
            ? 'cloud.dashboard.quotaUnavailable'
            : `cloud.dashboard.quota_${reason}`,
        )
      }}</strong>
      <p v-if="reason === 'upgrade'">{{ $t('cloud.dashboard.quotaHelp') }}</p>
    </div>
    <template #actions
      ><CfButton
        v-if="error"
        variant="secondary"
        size="sm"
        @click="emit('retry')"
        >{{ $t('cloud.messages.retry') }}</CfButton
      >
      <CfButton
        v-else-if="reason === 'upgrade'"
        variant="secondary"
        size="sm"
        :to="plansLink"
        >{{ $t('cloud.dashboard.viewPlans') }}</CfButton
      ></template
    ></CfAlert
  >
</template>
