<script setup lang="ts">
const props = defineProps<{ workspaceId: number | string }>()
const { t, locale } = useI18n()
const state = ref<any>(),
  busy = ref(false),
  error = ref('')
let generation = 0,
  alive = true
async function load() {
  const current = ++generation,
    id = Number(props.workspaceId)
  if (!id) return
  try {
    const result = await $fetch('/api/billing/payments', {
      query: { workspaceId: id },
    })
    if (alive && current === generation) {
      state.value = result
      error.value = ''
    }
  } catch {
    if (alive && current === generation)
      error.value = t('cloud.payments.failed')
  }
}
watch(
  () => props.workspaceId,
  () => {
    state.value = null
    error.value = ''
    void load()
  },
)
onMounted(load)
onBeforeUnmount(() => {
  alive = false
  generation++
})
useIntervalFn(() => {
  if (document.visibilityState === 'visible') void load()
}, 15000)
async function portal() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const workspaceId = Number(props.workspaceId)
  try {
    const result = await $fetch<{ url: string }>('/api/billing/payments', {
      method: 'POST',
      body: { action: 'portal', workspaceId },
    })
    if (alive && workspaceId === Number(props.workspaceId))
      await navigateTo(result.url, { external: true })
  } catch {
    if (alive) error.value = t('cloud.payments.failed')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudCard
    v-if="
      state && (state.enabled || state.subscriptions.length || state.pending)
    "
    class="cf-current-plan"
  >
    <div>
      <h2>{{ $t('cloud.payments.billing') }}</h2>
      <CloudBadge>{{ $t('cloud.payments.test') }}</CloudBadge>
      <p>{{ $t('cloud.payments.testHelp') }}</p>
      <p
        v-if="state.pending"
        role="status"
      >
        {{ $t('cloud.payments.pending') }}
      </p>
      <p
        v-for="s in state.subscriptions"
        :key="s.id"
        class="cf-field-hint"
      >
        {{ $t('cloud.payments.status.' + s.status) }} ·
        {{ new Date(s.period_end).toLocaleString(locale) }}
      </p>
      <p
        v-if="error"
        class="cf-error-message"
        role="alert"
      >
        {{ error }}
      </p>
    </div>
    <div class="cf-inline-controls">
      <CloudButton
        v-if="state.canManage && state.subscriptions.length"
        :loading="busy"
        @click="portal"
        >{{ $t('cloud.payments.manage') }}</CloudButton
      ><CloudButton
        v-if="state.canManage && state.pending?.url"
        as-child
        variant="secondary"
        ><a :href="state.pending.url">{{
          $t('cloud.payments.resume')
        }}</a></CloudButton
      >
      <p
        v-if="!state.canManage"
        class="cf-field-hint"
      >
        {{ $t('cloud.billing.adminOnly') }}
      </p>
    </div>
  </CloudCard>
</template>
