/** Apply the entry API base using request-scoped fetch, preserving SSR cookies. */
export function useConsoleApi() {
  const baseURL = useRuntimeConfig().public.console.apiBase
  // Keep the implementation boundary independent of Nuxt's recursive route types.
  // Callers retain the same generic response inference as the original $fetch.
  const fetcher = useRequestFetch() as (
    request: unknown,
    options?: Record<string, unknown>,
  ) => Promise<unknown>
  return ((request: unknown, options?: Record<string, unknown>) =>
    fetcher(request, { baseURL, ...options })) as typeof $fetch
}
/** Preserve useFetch inference without instantiating its generic overloads here. */
export const useConsoleFetch = ((
  request: unknown,
  options?: Record<string, unknown>,
) => {
  const fetcher = useFetch as (
    request: unknown,
    options?: Record<string, unknown>,
  ) => unknown
  return fetcher(request, {
    baseURL: useRuntimeConfig().public.console.apiBase,
    ...options,
  })
}) as typeof useFetch
