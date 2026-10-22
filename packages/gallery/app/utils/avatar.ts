export const DEFAULT_AVATAR_URL = '/web-app-manifest-192x192.png'

/**
 * Uploaded avatars use a relative route, which HTML URL inputs reject.
 * Keep this pattern in sync with processAvatar() and getAvatarPublicUrl() in
 * server/utils/avatar-store.ts. The upload endpoint in
 * server/api/system/settings/avatar.post.ts saves that URL as app:avatarUrl.
 */
export function getAvatarInputType(
  value: string | null | undefined,
): 'text' | 'url' {
  return /^\/avatar\/avatar-[a-f0-9]{16}\.webp$/.test(value ?? '')
    ? 'text'
    : 'url'
}

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
