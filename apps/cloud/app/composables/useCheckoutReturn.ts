import type { MaybeRefOrGetter } from 'vue'
export function useCheckoutReturn(
  workspaceId: MaybeRefOrGetter<number>,
  refresh: () => Promise<void>,
) {
  const route = useRoute(),
    state = ref<
      | 'idle'
      | 'checking'
      | 'pending'
      | 'completed'
      | 'failed'
      | 'expired'
      | 'inactive'
      | 'superseded'
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
            body: {
              action: 'refresh',
              workspaceId: id,
              checkoutId,
              providerCheckoutId:
                typeof route.query.checkout_id === 'string'
                  ? route.query.checkout_id
                  : undefined,
              subscriptionId:
                typeof route.query.subscription_id === 'string'
                  ? route.query.subscription_id
                  : undefined,
            },
          },
        )
        if (!alive || current !== generation) return
        await refresh()
        if (!alive || current !== generation) return
        if (['completed', 'inactive', 'superseded'].includes(result.state)) {
          state.value = result.state as 'completed' | 'inactive' | 'superseded'
          return
        }
        if (result.state === 'expired') {
          state.value = 'expired'
          return
        }
      } catch (e: any) {
        if (!alive || current !== generation) return
        if ([400, 401, 403, 404, 422].includes(e?.statusCode ?? e?.status)) {
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
      () => [
        route.query.checkout,
        route.query.checkout_id,
        route.query.subscription_id,
        toValue(workspaceId),
      ],
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
