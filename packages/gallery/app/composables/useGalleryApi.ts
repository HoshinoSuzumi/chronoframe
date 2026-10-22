import { useEntryApi, useEntryFetch } from './useEntryApi'
export function useGalleryApi() {
  return useEntryApi(useRuntimeConfig().public.gallery.apiBase)
}
export const useGalleryFetch = ((
  request: unknown,
  options?: Record<string, unknown>,
) =>
  useEntryFetch(
    request,
    options,
    useRuntimeConfig().public.gallery.apiBase,
  )) as typeof useFetch
