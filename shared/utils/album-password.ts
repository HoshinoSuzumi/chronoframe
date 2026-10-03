export const ALBUM_PASSWORD_MIN_LENGTH = 6
export const ALBUM_PASSWORD_MAX_LENGTH = 128

export function isValidAlbumPasswordLength(password: string): boolean {
  return (
    password.length >= ALBUM_PASSWORD_MIN_LENGTH &&
    password.length <= ALBUM_PASSWORD_MAX_LENGTH
  )
}
