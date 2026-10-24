import { useEntryApi, useEntryFetch } from './useEntryApi'
/** Public endpoints retain their API envelopes; the shared gallery consumes resource arrays. */
function publicPath(path: string, isPublic: boolean) {
  return isPublic && path === '/api/photos/visible' ? '/api/photos' : path
}
function galleryResponse(path: string, data: unknown, isPublic: boolean) {
  if (!isPublic || !data || typeof data !== 'object') return data
  const result = data as Record<string, unknown>
  if (['/api/photos', '/api/photos/visible'].includes(path))
    return result.photos
  if (path === '/api/albums') return result.albums
  if (/^\/api\/albums\/[1-9][0-9]*$/.test(path)) return result.album
  return data
}
export function useGalleryApi() {
  const isPublic = useEntryContext().value?.audience === 'public'
  const fetcher = useEntryApi(useRuntimeConfig().public.gallery.apiBase)
  return (async (request: string, options?: Record<string, unknown>) =>
    galleryResponse(
      request,
      await fetcher(publicPath(request, isPublic), options),
      isPublic,
    )) as typeof $fetch
}
export const useGalleryFetch = ((
  request: unknown,
  options?: Record<string, unknown>,
) => {
  const isPublic = useEntryContext().value?.audience === 'public'
  const original = computed(() => String(toValue(request as string)))
  const transform = options?.transform as
    | ((data: unknown) => unknown)
    | undefined
  return useEntryFetch(
    computed(() => publicPath(original.value, isPublic)),
    {
      ...options,
      transform: (data: unknown) => {
        const result = galleryResponse(original.value, data, isPublic)
        return transform ? transform(result) : result
      },
    },
    useRuntimeConfig().public.gallery.apiBase,
  )
}) as typeof useFetch
