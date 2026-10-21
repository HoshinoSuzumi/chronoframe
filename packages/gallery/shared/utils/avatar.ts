/**
 * Avatar upload constraints shared by the client-side uploader and the
 * server-side endpoint, so validation stays in sync.
 */

export const AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024 // 5 MB
