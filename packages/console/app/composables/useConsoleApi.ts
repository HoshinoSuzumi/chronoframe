import { useEntryApi, useEntryFetch } from '#gallery/composables/useEntryApi'
export function useConsoleApi() {
  return useEntryApi(useRuntimeConfig().public.console.apiBase)
}
export const useConsoleFetch = ((
  request: unknown,
  options?: Record<string, unknown>,
) =>
  useEntryFetch(
    request,
    options,
    useRuntimeConfig().public.console.apiBase,
  )) as typeof useFetch
