const OG_AVATAR_FALLBACK = '/web-app-manifest-512x512.png'

/** Keep media authorization at the entry's existing thumbnail endpoint. */
export function resolveShareThumbnail(
  value: string | null | undefined,
  edition: 'self-hosted' | 'cloud' | 'site',
): string | undefined {
  if (!value) return undefined
  // Only Self-hosted supplies the Sharp-backed JPEG proxy. Edge entries serve
  // their thumbnails through Site-scoped media routes instead.
  return edition === 'self-hosted'
    ? `/thumb/${encodeURIComponent(value)}`
    : value
}

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
