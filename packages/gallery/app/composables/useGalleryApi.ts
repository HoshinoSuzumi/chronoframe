/** Public gallery API base is supplied by the consuming entry. */
export function useGalleryApi() {
  const fetcher = useRequestFetch()
  const baseURL = useRuntimeConfig().public.gallery.apiBase
  return ((
    request: Parameters<typeof fetcher>[0],
    options?: Parameters<typeof fetcher>[1],
  ) => fetcher(request, { baseURL, ...options })) as typeof fetcher
}
export const useGalleryFetch = ((
  request: Parameters<typeof useFetch>[0],
  options?: Parameters<typeof useFetch>[1],
) =>
  useFetch(request, {
    baseURL: useRuntimeConfig().public.gallery.apiBase,
    ...options,
  })) as typeof useFetch
