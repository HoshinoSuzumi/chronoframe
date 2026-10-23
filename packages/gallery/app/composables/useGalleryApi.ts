import { useEntryApi, useEntryFetch } from './useEntryApi'
/** Create a request-scoped gallery transport using this entry's API origin. */
export function useGalleryApi() {
  return useEntryApi(useRuntimeConfig().public.gallery.apiBase)
}
/** Preserve useFetch response inference while applying gallery transport and scope keys. */
export const useGalleryFetch = ((
  request: unknown,
  options?: Record<string, unknown>,
) =>
  useEntryFetch(
    request,
    options,
    useRuntimeConfig().public.gallery.apiBase,
  )) as typeof useFetch
