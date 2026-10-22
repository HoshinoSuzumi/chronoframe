import { useEntryContext, entryRequestPath } from './useEntryContext'
/** Snapshot the context for this request; a route switch cannot retarget an in-flight request. */
export function useEntryApi(baseURL: string) {
  const context = useEntryContext()
  const fetcher = useRequestFetch() as typeof $fetch
  return ((request: string, options?: Record<string, unknown>) => {
    const snapshot = context.value
    return fetcher(entryRequestPath(request, snapshot), { ...options, baseURL })
  }) as typeof $fetch
}
export function useEntryFetch(
  request: unknown,
  options: Record<string, unknown> | undefined,
  baseURL: string,
) {
  const context = useEntryContext()
  const path = computed(() =>
    entryRequestPath(String(toValue(request as string)), context.value),
  )
  const key = computed(
    () =>
      `${context.value?.scope ?? 'self-hosted'}:fetch:${String(toValue(options?.key as string) ?? path.value)}`,
  )
  const fetcher = useFetch as (
    request: unknown,
    options: Record<string, unknown>,
  ) => unknown
  return fetcher(path, { ...options, baseURL, key })
}
