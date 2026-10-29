import type { MaybeRefOrGetter } from 'vue'
export function useCloudPayments(
  workspaceId: MaybeRefOrGetter<number | string>,
) {
  const { t } = useI18n(),
    data = ref<any>(),
    busy = ref(false),
    error = ref('')
  let generation = 0,
    alive = true
  async function refresh() {
    const current = ++generation,
      id = Number(toValue(workspaceId))
    if (!id) return
    try {
      const result = await $fetch('/api/billing/payments', {
        query: { workspaceId: id },
        timeout: 15000,
      })
      if (alive && current === generation) {
        data.value = result
        error.value = ''
      }
    } catch {
      if (alive && current === generation)
        error.value = t('cloud.payments.failed')
    }
  }
  watch(
    () => toValue(workspaceId),
    () => {
      data.value = null
      error.value = ''
      void refresh()
    },
  )
  onMounted(refresh)
  onBeforeUnmount(() => {
    alive = false
    generation++
  })
  useIntervalFn(() => {
    if (document.visibilityState === 'visible') void refresh()
  }, 15000)
  return { data, busy, error, refresh }
}
