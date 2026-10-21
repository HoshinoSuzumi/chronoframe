export const ALBUM_PASSWORD_MIN_LENGTH = 6
export const ALBUM_PASSWORD_MAX_LENGTH = 128
export const MAX_ALBUM_PHOTOS_PER_REQUEST = 1000

export interface AddPhotosToAlbumResult {
  added: number
  alreadyPresent: number
  missing: number
}

export function isValidAlbumPasswordLength(password: string): boolean {
  return (
    password.length >= ALBUM_PASSWORD_MIN_LENGTH &&
    password.length <= ALBUM_PASSWORD_MAX_LENGTH
  )
}
