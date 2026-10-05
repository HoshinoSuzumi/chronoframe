/**
 * MIME types for the upload formats ChronoFrame accepts, keyed by extension.
 *
 * Browsers on Windows, Android and Linux commonly report an empty `File.type`
 * (and therefore send `application/octet-stream`) for HEIC/HEIF and some video
 * files, because the OS has no registered type for them. Both the client and
 * the upload endpoint fall back to this table so the MIME whitelist can be
 * enforced against a meaningful type instead of a generic one.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
}

const GENERIC_CONTENT_TYPES = new Set(['', 'application/octet-stream'])

/** Look up a MIME type by the file name's extension, or `undefined` if unknown. */
export const mimeTypeFromFileName = (fileName: string): string | undefined => {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return undefined
  return MIME_BY_EXTENSION[base.slice(dot + 1).toLowerCase()]
}

/**
 * Pick the content type to use for an upload.
 *
 * A specific type reported by the browser (or sent in the request header) wins.
 * When it is missing or the generic `application/octet-stream`, the extension
 * is used instead. Falls back to `application/octet-stream` when neither helps.
 */
export const resolveUploadContentType = (
  fileName: string,
  reportedType?: string | null,
): string => {
  const normalized = (reportedType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (!GENERIC_CONTENT_TYPES.has(normalized)) {
    return normalized
  }
  return mimeTypeFromFileName(fileName) ?? 'application/octet-stream'
}
