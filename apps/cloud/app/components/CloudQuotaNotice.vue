<script setup lang="ts">
defineProps<{ reason: string; error?: boolean; resource?: string }>()
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
    <CfButton
      v-if="error"
      variant="secondary"
      size="sm"
      @click="emit('retry')"
      >{{ $t('cloud.messages.retry') }}</CfButton
    ><CfButton
      v-else-if="reason === 'upgrade'"
      as-child
      variant="secondary"
      size="sm"
      ><NuxtLink to="/account/plan#plans">{{
        $t('cloud.dashboard.viewPlans')
      }}</NuxtLink></CfButton
    ></CfAlert
  >
</template>
