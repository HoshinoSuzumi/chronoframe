import { useEntryContext, entryRequestPath } from './useEntryContext'
/** Bind to the creating scope; delayed handlers must never target a different Site/account. */
export function useEntryApi(baseURL: string) {
  const context = useEntryContext()
  // Scoped paths are dynamic; avoid instantiating Nitro's route matcher here.
  const fetcher = useRequestFetch() as (
    request: string,
    options: Record<string, unknown>,
  ) => Promise<unknown>
  const snapshot = context.value
  return (async (request: string, options?: Record<string, unknown>) => {
    if (context.value?.scope !== snapshot?.scope)
      throw new Error('Site context changed; discard the previous request')
    return fetcher(entryRequestPath(request, snapshot), { ...options, baseURL })
  }) as typeof $fetch
}
/** Keep reactive fetch paths and hydration-cache keys inside the active entry scope. */
export function useEntryFetch(
  request: unknown,
  options: Record<string, unknown> | undefined,
  baseURL: string,
) {
  // A mounted consumer belongs to its creating Site, including while leaving.
  const snapshot = useEntryContext().value
  const path = computed(() =>
    entryRequestPath(String(toValue(request as string)), snapshot),
  )
  const key = computed(
    () =>
      `${snapshot?.scope ?? 'self-hosted'}:fetch:${String(toValue(options?.key as string) ?? path.value)}`,
  )
  const fetcher = useFetch as (
    request: unknown,
    options: Record<string, unknown>,
  ) => unknown
  return fetcher(path, { ...options, baseURL, key })
}
