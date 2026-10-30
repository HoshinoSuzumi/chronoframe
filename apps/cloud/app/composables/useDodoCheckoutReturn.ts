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
    timer: ReturnType<typeof setTimeout> | undefined,
    deadlineTimer: ReturnType<typeof setTimeout> | undefined,
    windowKey = '',
    deadline = 0
  async function check() {
    const current = ++generation
    if (timer) clearTimeout(timer)
    if (deadlineTimer) clearTimeout(deadlineTimer)
    const id = toValue(workspaceId),
      checkout = route.query.checkout
    if (!toValue(enabled) || !id || typeof checkout !== 'string') {
      state.value = 'idle'
      return
    }
    const key = `${id}:${checkout}`
    if (windowKey !== key) {
      windowKey = key
      deadline = Date.now() + 60000
    }
    if (Date.now() >= deadline) {
      state.value = 'pending'
      return
    }
    state.value = 'checking'
    // Bound the whole return flow, including slow refreshes and transient workspace resets.
    deadlineTimer = setTimeout(() => {
      if (!alive || current !== generation) return
      generation++
      deadline = 0
      if (timer) clearTimeout(timer)
      state.value = 'pending'
    }, deadline - Date.now())
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
        if (
          ['completed', 'scheduled', 'expired', 'inactive'].includes(
            result.state,
          )
        ) {
          if (deadlineTimer) clearTimeout(deadlineTimer)
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
          if (deadlineTimer) clearTimeout(deadlineTimer)
          state.value = 'failed'
          await refresh()
          return
        }
      }
      if (attempt >= 7) {
        if (deadlineTimer) clearTimeout(deadlineTimer)
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
    if (deadlineTimer) clearTimeout(deadlineTimer)
  })
  return {
    state,
    retry: () => {
      windowKey = ''
      return check()
    },
  }
}
