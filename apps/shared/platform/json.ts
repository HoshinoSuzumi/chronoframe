import { createError } from 'h3'

/** Bound bytes before decoding or parsing, including requests with no length header. */
export async function readSiteBody(
  stream: ReadableStream<Uint8Array> | null | undefined,
  limit = 4096,
): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 131072)
    throw createError({ statusCode: 400 })
  if (!stream) throw createError({ statusCode: 400 })
  const reader = stream.getReader()
  const bytes = new Uint8Array(limit)
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (size + value.byteLength > bytes.byteLength) {
        await reader.cancel().catch(() => undefined)
        throw createError({ statusCode: 400 })
      }
      bytes.set(value, size)
      size += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  let body: unknown
  try {
    body = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)),
    )
  } catch {
    throw createError({ statusCode: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw createError({ statusCode: 400 })
  return body as Record<string, unknown>
}
