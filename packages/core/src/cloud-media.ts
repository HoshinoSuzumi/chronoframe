/** Internal durable cloud catalog contracts. Applications authorize the Site and
 * verify stored objects before completing uploads. No storage secrets or URLs.
 */
export interface UploadReservation {
  id: string
  ownerId: number
  photoId: string
  sourceVersion: string
  connectionId: string
  objectKey: string
  providerUploadId: string | null
  expectedBytes: number
  expiresAt: number
}
export interface MediaPhoto {
  id: string
  title: string
  source_version: string
}
export interface MediaUpload {
  id: string
  owner_id: number
  photo_id: string
  source_version: string
  connection_id: string
  object_key: string
  provider_upload_id: string | null
  expected_video_bytes: number
  expected_bytes: number
  expires_at: number
  state: 'pending' | 'completed' | 'cancelled'
}

export interface CloudMediaRepository {
  photo(id: string): Promise<MediaPhoto | null>
  album(id: string): Promise<{ id: string; title: string } | null>
  createAlbum(id: string, title: string): Promise<void>
  addToAlbum(albumId: string, photoId: string): Promise<void>
  /** Keyset page, at most 100 rows; pass the final ID to continue. */
  albumPhotos(albumId: string, after?: string): Promise<MediaPhoto[]>
  upload(id: string, ownerId: number): Promise<MediaUpload | null>
  reserveUpload(input: UploadReservation): Promise<void>
  completeUpload(input: {
    id: string
    ownerId: number
    jobId: string
    pipelineVersion: string
    title: string
    now: number
  }): Promise<string>
  cancelUpload(id: string, ownerId: number): Promise<void>
  job(id: string): Promise<{
    id: string
    photo_id: string
    source_version: string
    state: string
  } | null>
  deletePhoto(id: string): Promise<void>
}
