import { directUploads, abortDirectUpload } from '~~/server/utils/direct-upload'
import type { UploadPart } from '~~/shared/types/upload'
import { logUpload } from '../../../utils/upload-log'

export default eventHandler(async (event) => {
  const user = await requireUserSession(event)
  const id = getRouterParam(event, 'id') || ''
  const session = directUploads.get(id)
  if (!session || session.owner !== String(user.user.id))
    throw createError({
      statusCode: 404,
      statusMessage: 'Upload session not found',
    })
  if (event.method === 'DELETE') {
    logUpload('multipart.cancel.requested', {
      sessionId: id,
      key: session.key,
      busy: session.busy,
    })
    await abortDirectUpload(id)
    return { ok: true }
  }
  if (event.method !== 'POST') throw createError({ statusCode: 405 })
  if (session.cancelled)
    throw createError({ statusCode: 410, statusMessage: 'Upload cancelled' })
  if (session.busy)
    throw createError({ statusCode: 409, statusMessage: 'Upload is busy' })
  if (session.completed) {
    logUpload('multipart.complete.repeated', {
      sessionId: id,
      key: session.key,
    })
    return { ok: true, key: session.key }
  }
  session.busy = true
  session.touched = Date.now()
  const startedAt = Date.now()
  logUpload('multipart.complete.started', {
    sessionId: id,
    key: session.key,
    partCount: session.setup.partUrls.length,
  })
  try {
    const body = (await readBody(event)) as { parts?: UploadPart[] }
    const parts = body?.parts
    if (
      !Array.isArray(parts) ||
      parts.length !== session.setup.partUrls.length ||
      parts.some(
        (part, index) =>
          !part ||
          part.partNumber !== index + 1 ||
          typeof part.etag !== 'string' ||
          !part.etag ||
          part.etag.length > 256,
      )
    )
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid multipart completion data',
      })
    if (session.cancelled)
      throw createError({ statusCode: 410, statusMessage: 'Upload cancelled' })
    await session.setup.complete(parts)
    session.completed = true
    logUpload('multipart.complete.succeeded', {
      sessionId: id,
      key: session.key,
      partCount: parts.length,
      durationMs: Date.now() - startedAt,
    })
    return { ok: true, key: session.key }
  } catch (error) {
    logUpload(
      'multipart.complete.failed',
      { sessionId: id, key: session.key, durationMs: Date.now() - startedAt },
      error,
    )
    throw error
  } finally {
    session.busy = false
    session.touched = Date.now()
    if (session.cancelled) await abortDirectUpload(id)
  }
})
