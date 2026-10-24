/** Public, fixed connection diagnostics; never expose provider responses or signed URLs. */
export const STORAGE_CONNECTION_MESSAGES = {
  storage_configuration_failed:
    'Check the S3 endpoint, region, bucket name and credential fields.',
  storage_write_failed:
    'Storage write check failed. Check credentials, object-write permission and service availability.',
  storage_read_failed:
    'Storage read check failed. Check object-read permission and service availability.',
  storage_signed_read_failed:
    'Signed storage access failed. Check the endpoint, region and S3 credentials.',
  storage_multipart_failed:
    'Multipart upload check failed. Check multipart creation, listing and abort permissions.',
  storage_multipart_create_failed:
    'Creating a multipart upload failed. Check storage permissions and S3 service compatibility.',
  storage_multipart_list_failed:
    'Listing multipart uploads failed or did not return the new upload. Check multipart listing permissions and S3 service compatibility.',
  storage_multipart_abort_failed:
    'Aborting the test multipart upload failed. Check multipart abort permissions.',
  storage_cors_failed:
    'Storage CORS check failed. Allow this portal origin, GET/PUT/HEAD, Content-Type, and expose ETag.',
  storage_cleanup_failed:
    'Storage cleanup check failed. Check object-delete permission.',
} as const
export type StorageConnectionErrorCode =
  keyof typeof STORAGE_CONNECTION_MESSAGES
