import { open, stat, rm } from 'node:fs/promises'
import { UPLOAD_CHUNK_SIZE } from '../../../../shared/utils/upload'
import { logUpload } from '../../../utils/upload-log'
import {
  chunkUploads,
  chunkHash,
  removeChunkUpload,
} from '~~/server/utils/chunk-upload'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id') || ''
  const upload = chunkUploads.get(id)
  if (!upload || upload.owner !== String(session.user.id)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Upload session not found',
    })
  }
  if (event.method === 'DELETE') {
    logUpload('local.cancel.requested', {
      sessionId: id,
      key: upload.key,
      activeParts: upload.activeParts.size,
      busy: upload.busy,
    })
    await removeChunkUpload(id)
    return { ok: true }
  }
  if (upload.cancelled)
    throw createError({ statusCode: 410, statusMessage: 'Upload cancelled' })
  if (upload.busy || (event.method === 'POST' && upload.activeParts.size))
    throw createError({ statusCode: 409, statusMessage: 'Upload is busy' })
  upload.busy = event.method === 'POST'
  let activeIndex: number | undefined
  upload.touched = Date.now()
  const startedAt = Date.now()
  try {
    if (event.method === 'POST') {
      if (upload.completed) {
        logUpload('local.complete.repeated', { sessionId: id, key: upload.key })
        return { ok: true, key: upload.key }
      }
      logUpload('local.complete.started', {
        sessionId: id,
        key: upload.key,
        receivedParts: upload.hashes.size,
        size: upload.size,
      })
      if (
        upload.hashes.size !== Math.ceil(upload.size / UPLOAD_CHUNK_SIZE) ||
        (await stat(upload.filePath)).size !== upload.size
      ) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Upload is incomplete',
        })
      }
      await upload.provider.createFromFile(
        upload.key,
        upload.filePath,
        upload.contentType,
      )
      upload.completed = true
      logUpload('local.complete.succeeded', {
        sessionId: id,
        key: upload.key,
        size: upload.size,
        durationMs: Date.now() - startedAt,
      })
      await rm(upload.filePath, { force: true }).catch(() => {})
      return { ok: true, key: upload.key }
    }
    if (event.method !== 'PUT') throw createError({ statusCode: 405 })
    if (upload.completed)
      throw createError({
        statusCode: 409,
        statusMessage: 'Upload already completed',
      })
    const index = Number(getQuery(event).index)
    const count = Math.ceil(upload.size / UPLOAD_CHUNK_SIZE)
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid chunk index',
      })
    }
    if (upload.activeParts.has(index))
      throw createError({ statusCode: 409, statusMessage: 'Chunk is busy' })
    upload.activeParts.add(index)
    activeIndex = index
    const expected = Math.min(
      UPLOAD_CHUNK_SIZE,
      upload.size - index * UPLOAD_CHUNK_SIZE,
    )
    logUpload('local.part.started', {
      sessionId: id,
      key: upload.key,
      partNumber: index + 1,
      partCount: count,
      expectedBytes: expected,
      activeParts: upload.activeParts.size,
    })
    const chunks: Buffer[] = []
    let size = 0
    // Nitro's dev proxy can provide a cached/web body rather than a live Node
    // IncomingMessage. Reading node.req directly can wait forever for its end.
    const stream = getRequestWebStream(event)
    const reader = stream?.getReader()
    if (!reader)
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing chunk body',
      })
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > expected) {
          await reader.cancel()
          throw createError({
            statusCode: 413,
            statusMessage: 'Chunk too large',
          })
        }
        chunks.push(Buffer.from(value))
      }
    } finally {
      reader.releaseLock()
    }
    if (size !== expected)
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid chunk size',
      })
    const data = Buffer.concat(chunks)
    const hash = chunkHash(data)
    if (upload.cancelled)
      throw createError({ statusCode: 410, statusMessage: 'Upload cancelled' })
    if (upload.hashes.has(index)) {
      if (upload.hashes.get(index) !== hash)
        throw createError({
          statusCode: 409,
          statusMessage: 'Chunk content mismatch',
        })
      logUpload('local.part.duplicate', {
        sessionId: id,
        key: upload.key,
        partNumber: index + 1,
        bytes: size,
        durationMs: Date.now() - startedAt,
      })
      return { ok: true }
    }
    const file = await open(upload.filePath, 'r+')
    try {
      let written = 0
      while (written < data.length) {
        const result = await file.write(
          data,
          written,
          data.length - written,
          index * UPLOAD_CHUNK_SIZE + written,
        )
        written += result.bytesWritten
      }
    } finally {
      await file.close()
    }
    upload.hashes.set(index, hash)
    logUpload('local.part.received', {
      sessionId: id,
      key: upload.key,
      partNumber: index + 1,
      bytes: size,
      receivedParts: upload.hashes.size,
      partCount: count,
      durationMs: Date.now() - startedAt,
    })
    return { ok: true }
  } catch (error) {
    logUpload(
      'local.request.failed',
      {
        sessionId: id,
        key: upload.key,
        method: event.method,
        partNumber: activeIndex === undefined ? undefined : activeIndex + 1,
        durationMs: Date.now() - startedAt,
      },
      error,
    )
    throw error
  } finally {
    if (event.method === 'POST') upload.busy = false
    if (activeIndex !== undefined) upload.activeParts.delete(activeIndex)
    upload.touched = Date.now()
    if (upload.cancelled) await removeChunkUpload(id)
  }
})
