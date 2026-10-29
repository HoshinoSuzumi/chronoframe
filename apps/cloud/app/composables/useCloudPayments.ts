import type { MaybeRefOrGetter } from 'vue'
export function useCloudPayments(
  workspaceId: MaybeRefOrGetter<number | string>,
  onReconciled?: () => Promise<void>,
) {
  const { t } = useI18n(),
    data = ref<any>(),
    busy = ref(false),
    error = ref('')
  let generation = 0,
    alive = true,
    pending = false
  async function refresh({ reconcile = true }: { reconcile?: boolean } = {}) {
    const current = ++generation,
      id = Number(toValue(workspaceId))
    if (!id) {
      pending = false
      busy.value = false
      return
    }
    pending = true
    busy.value = true
    try {
      let result = await $fetch<any>('/api/billing/payments', {
        query: { workspaceId: id },
        timeout: 15000,
      })
      if (
        alive &&
        current === generation &&
        reconcile &&
        result.canManage &&
        result.pending?.canRefresh
      ) {
        // A stored checkout must converge even when the return URL parameters are gone.
        try {
          await $fetch('/api/billing/payments', {
            method: 'POST',
            timeout: 15000,
            body: {
              action: 'refresh',
              workspaceId: id,
              checkoutId: result.pending.id,
            },
          })
        } catch {
          // Re-read the local state/diagnostic persisted by the authenticated check.
        }
        if (!alive || current !== generation) return
        result = await $fetch<any>('/api/billing/payments', {
          query: { workspaceId: id },
          timeout: 15000,
        })
        if (alive && current === generation && !result.pending)
          await onReconciled?.()
      }
      if (alive && current === generation) {
        data.value = result
        error.value = ''
      }
    } catch {
      if (alive && current === generation)
        error.value = t('cloud.payments.failed')
    } finally {
      if (current === generation) {
        pending = false
        busy.value = false
      }
    }
  }
  watch(
    () => toValue(workspaceId),
    () => {
      data.value = null
      error.value = ''
      void refresh({ reconcile: true })
    },
  )
  onMounted(() => void refresh({ reconcile: true }))
  onBeforeUnmount(() => {
    alive = false
    generation++
  })
  useIntervalFn(() => {
    if (document.visibilityState === 'visible' && !pending)
      void refresh({ reconcile: false })
  }, 15000)
  return { data, busy, error, refresh }
}
