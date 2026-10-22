export interface AlbumAccessTarget {
  id: number
  isHidden: boolean
  passwordHash: string | null
}

/** Hidden albums require a session; public protected albums require a current password grant. */
export function canReadAlbum(
  album: AlbumAccessTarget,
  authenticated: boolean,
  hasGrant: (album: AlbumAccessTarget) => boolean,
): boolean {
  return (
    authenticated ||
    (!album.isHidden && (!album.passwordHash || hasGrant(album)))
  )
}

/** A hidden membership wins; otherwise one valid protected membership permits media access. */
export function photoAccessDenied(
  authenticated: boolean,
  memberships: { album: AlbumAccessTarget }[],
  canAccess: (album: AlbumAccessTarget) => boolean,
): boolean {
  if (authenticated) return false
  return (
    memberships.some(({ album }) => album.isHidden) ||
    (memberships.some(({ album }) => album.passwordHash) &&
      !memberships.some(({ album }) => album.passwordHash && canAccess(album)))
  )
}
