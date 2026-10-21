/** Entry-owned base for application APIs; storage upload URLs bypass this adapter. */
export function useConsoleApi() {
  const baseURL = useRuntimeConfig().public.console.apiBase
  const fetcher = useRequestFetch()
  return ((
    request: Parameters<typeof fetcher>[0],
    options?: Parameters<typeof fetcher>[1],
  ) => fetcher(request, { baseURL, ...options })) as typeof fetcher
}
/** Preserve Nuxt useFetch inference while applying the entry-owned API base. */
export const useConsoleFetch = ((
  request: Parameters<typeof useFetch>[0],
  options?: Parameters<typeof useFetch>[1],
) =>
  useFetch(request, {
    baseURL: useRuntimeConfig().public.console.apiBase,
    ...options,
  })) as typeof useFetch
