import type { MaybeRefOrGetter } from 'vue'
export function useCheckoutReturn(
  workspaceId: MaybeRefOrGetter<number>,
  refresh: () => Promise<void>,
) {
  const route = useRoute(),
    state = ref<
      'idle' | 'checking' | 'pending' | 'completed' | 'failed' | 'expired'
    >(typeof route.query.checkout === 'string' ? 'checking' : 'idle')
  let generation = 0,
    alive = true,
    timer: ReturnType<typeof setTimeout> | undefined
  async function check() {
    const checkoutId =
        typeof route.query.checkout === 'string' ? route.query.checkout : '',
      id = toValue(workspaceId)
    const current = ++generation
    if (timer) clearTimeout(timer)
    if (!checkoutId || !id) {
      state.value = 'idle'
      return
    }
    state.value = 'checking'
    async function poll(attempt: number) {
      if (!alive || current !== generation) return
      try {
        const result = await $fetch<{ state: string }>(
          '/api/billing/payments',
          {
            method: 'POST',
            body: { action: 'refresh', workspaceId: id, checkoutId },
          },
        )
        if (!alive || current !== generation) return
        await refresh()
        if (!alive || current !== generation) return
        if (result.state === 'completed') {
          state.value = 'completed'
          return
        }
        if (result.state === 'expired') {
          state.value = 'expired'
          return
        }
      } catch (e: any) {
        if (!alive || current !== generation) return
        if ([400, 401, 403, 404].includes(e?.statusCode ?? e?.status)) {
          state.value = 'failed'
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
  onMounted(() => {
    watch(
      () => [route.query.checkout, toValue(workspaceId)],
      () => void check(),
      { immediate: true },
    )
  })
  onBeforeUnmount(() => {
    alive = false
    generation++
    if (timer) clearTimeout(timer)
  })
  return { state, retry: check }
}
