import type { MaybeRefOrGetter } from 'vue'
import { quotaGate, type QuotaResource } from '../utils/quota-gate'
/** Presentation preflight only; each write still applies the server's atomic admission checks. */
export function useCloudQuota(
  workspaceId: MaybeRefOrGetter<number | undefined>,
) {
  const id = computed(() => Number(toValue(workspaceId)) || 0)
  const request = useFetch<any>('/api/billing/plan', {
    query: computed(() => ({ workspaceId: id.value })),
    key: computed(() => `quota-${id.value}`),
    immediate: !!id.value,
  })
  useIntervalFn(() => {
    if (
      id.value &&
      document.visibilityState === 'visible' &&
      request.status.value !== 'pending'
    )
      void request.refresh()
  }, 15000)
  return {
    ...request,
    gate: (resource: QuotaResource, mode: 'platform' | 'byos' = 'platform') =>
      quotaGate(request.data.value, resource, mode),
  }
}
