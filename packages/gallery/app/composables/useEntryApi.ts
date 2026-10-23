import { useEntryContext, entryRequestPath } from './useEntryContext'
/** Bind to the creating scope; delayed handlers must never target a different Site/account. */
export function useEntryApi(baseURL: string) {
  const context = useEntryContext()
  const fetcher = useRequestFetch() as typeof $fetch
  const snapshot = context.value
  return (async (request: string, options?: Record<string, unknown>) => {
    if (context.value?.scope !== snapshot?.scope)
      throw new Error('Site context changed; discard the previous request')
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
