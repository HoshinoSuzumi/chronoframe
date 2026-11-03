/** Only unsupported/denied multipart operations may downgrade to signed PUT. */
export function canFallbackToSingleUpload(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const failure = error as {
    name?: string
    Code?: string
    $metadata?: { httpStatusCode?: number }
  }
  return (
    [405, 501].includes(failure.$metadata?.httpStatusCode ?? 0) ||
    [
      'NotImplemented',
      'NotSupported',
      'UnsupportedOperation',
      'AccessDenied',
    ].includes(failure.name || failure.Code || '')
  )
}
