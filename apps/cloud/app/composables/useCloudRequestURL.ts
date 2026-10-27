/** Keep SSR host decisions consistent with the original Worker request. */
export function useCloudRequestURL() {
  const request = import.meta.server
    ? (useRequestEvent()?.context.cloudflare?.request as Request | undefined)
    : undefined
  return request ? new URL(request.url) : useRequestURL()
}
