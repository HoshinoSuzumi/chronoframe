import { logger } from './logger'

// Log lifecycle metadata only: never URLs, headers, credentials or file bodies.
export function logUpload(
  event: string,
  details: Record<string, string | number | boolean | undefined>,
  error?: unknown,
) {
  if (error !== undefined) {
    const failure = error as {
      name?: string
      Code?: string
      statusCode?: number
      statusMessage?: string
      $metadata?: { httpStatusCode?: number }
    } | null
    logger.storage.warn(`[upload] ${event}`, {
      ...details,
      errorName: failure?.name,
      errorCode: failure?.Code,
      statusCode: failure?.statusCode ?? failure?.$metadata?.httpStatusCode,
      reason: failure?.statusMessage,
    })
  } else {
    logger.storage.info(`[upload] ${event}`, details)
  }
}
