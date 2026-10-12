export const DEFAULT_AVATAR_URL = '/web-app-manifest-192x192.png'

/**
 * `<img>` error handler that swaps a broken avatar for the default image.
 * Guarded so a broken fallback cannot loop.
 */
export function handleAvatarError(event: Event): void {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src.includes('web-app-manifest-192x192')) {
    return
  }
  image.src = DEFAULT_AVATAR_URL
}
