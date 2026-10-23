import { useEntryApi, useEntryFetch } from '#gallery/composables/useEntryApi'
/** Create a console transport bound to the current Site/account and entry API origin. */
export function useConsoleApi() {
  return useEntryApi(useRuntimeConfig().public.console.apiBase)
}
/** Preserve useFetch response inference while applying console transport and scope keys. */
export const useConsoleFetch = ((
  request: unknown,
  options?: Record<string, unknown>,
) =>
  useEntryFetch(
    request,
    options,
    useRuntimeConfig().public.console.apiBase,
  )) as typeof useFetch
