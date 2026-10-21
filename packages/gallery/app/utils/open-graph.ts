const OG_AVATAR_FALLBACK = '/web-app-manifest-512x512.png'

export function cleanShareText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

/**
 * Avatars are rendered inside the generated share image, so only pass URLs the
 * image renderer can fetch: a site-relative path or an absolute http(s) URL.
 */
export function resolveShareAvatar(value: unknown): string {
  if (typeof value !== 'string') return OG_AVATAR_FALLBACK
  const url = value.trim()
  if (!url) return OG_AVATAR_FALLBACK
  if (url.startsWith('/') && !url.startsWith('//')) return url
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  return OG_AVATAR_FALLBACK
}
