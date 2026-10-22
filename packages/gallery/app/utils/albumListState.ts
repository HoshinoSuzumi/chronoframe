type AlbumListRequestStatus = 'idle' | 'pending' | 'success' | 'error'

export function getAlbumListState(
  status: AlbumListRequestStatus,
  visibleAlbumCount: number,
): 'loading' | 'empty' | 'error' | 'ready' {
  if (status === 'pending' || status === 'idle') return 'loading'
  if (status === 'error') return 'error'
  return visibleAlbumCount === 0 ? 'empty' : 'ready'
}
