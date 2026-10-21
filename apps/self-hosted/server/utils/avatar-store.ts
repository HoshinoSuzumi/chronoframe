import { createHash } from 'node:crypto'
import type { StorageProvider } from '~~/server/services/storage'
import sharp from 'sharp'

export const AVATAR_ROUTE_PREFIX = '/avatar'

const AVATAR_DIMENSION = 512
const AVATAR_QUALITY = 90
const AVATAR_KEY_PREFIX = 'avatars'
const AVATAR_FILENAME_PATTERN = /^avatar-[a-f0-9]{16}\.webp$/

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16)
}

export function isAvatarFileName(fileName: string): boolean {
  return AVATAR_FILENAME_PATTERN.test(fileName)
}

export function getAvatarPublicUrl(fileName: string): string {
  return `${AVATAR_ROUTE_PREFIX}/${fileName}`
}

export function buildAvatarObjectKey(fileName: string): string {
  return `${AVATAR_KEY_PREFIX}/${fileName}`
}

export function avatarFileNameFromKey(key: string): string {
  const segments = key.split('/')
  return segments[segments.length - 1] ?? ''
}

export async function processAvatar(
  buffer: Buffer,
): Promise<{ buffer: Buffer; fileName: string }> {
  const processed = await sharp(buffer, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize(AVATAR_DIMENSION, AVATAR_DIMENSION, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: AVATAR_QUALITY })
    .toBuffer()

  return { buffer: processed, fileName: `avatar-${hashBuffer(processed)}.webp` }
}

export async function storeAvatar(
  provider: StorageProvider,
  buffer: Buffer,
): Promise<{ url: string; key: string }> {
  const { buffer: processed, fileName } = await processAvatar(buffer)
  const object = await provider.create(
    buildAvatarObjectKey(fileName),
    processed,
    'image/webp',
  )
  return { url: getAvatarPublicUrl(fileName), key: object.key }
}
