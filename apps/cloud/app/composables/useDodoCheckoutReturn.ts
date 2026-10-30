import type { MaybeRefOrGetter } from 'vue'
/** A return triggers an authenticated provider check; URL payment/subscription IDs are ignored. */
export function useDodoCheckoutReturn(
  workspaceId: MaybeRefOrGetter<number>,
  enabled: MaybeRefOrGetter<boolean>,
  refresh: () => Promise<void>,
) {
  const route = useRoute(),
    state = ref('idle')
  let generation = 0,
    alive = true,
    timer: ReturnType<typeof setTimeout> | undefined
  async function check() {
    const current = ++generation
    if (timer) clearTimeout(timer)
    const id = toValue(workspaceId),
      checkout = route.query.checkout
    if (!toValue(enabled) || !id || typeof checkout !== 'string') {
      state.value = 'idle'
      return
    }
    state.value = 'checking'
    async function poll(attempt: number): Promise<void> {
      if (!alive || current !== generation) return
      try {
        const result = await $fetch<{ state: string }>(
          '/api/billing/payments',
          {
            method: 'POST',
            timeout: 15000,
            body: { action: 'refresh', workspaceId: id, checkoutId: checkout },
          },
        )
        if (!alive || current !== generation) return
        await refresh()
        if (!alive || current !== generation) return
        if (['completed', 'expired', 'inactive'].includes(result.state)) {
          state.value = result.state
          return
        }
      } catch (error: any) {
        if (!alive || current !== generation) return
        if (
          [400, 401, 403, 404, 410, 422, 503].includes(
            error?.statusCode ?? error?.status,
          )
        ) {
          state.value = 'failed'
          await refresh()
          return
        }
      }
      if (attempt >= 7) {
        state.value = 'pending'
        return
      }
      timer = setTimeout(() => void poll(attempt + 1), 5000)
    }
    await poll(0)
  }
  onMounted(() =>
    watch(
      [
        () => toValue(workspaceId),
        () => toValue(enabled),
        () => route.query.checkout,
      ],
      () => void check(),
      { immediate: true },
    ),
  )
  onBeforeUnmount(() => {
    alive = false
    generation++
    if (timer) clearTimeout(timer)
  })
  return { state, retry: check }
}
