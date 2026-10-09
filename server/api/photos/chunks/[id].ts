import { open, stat, rm } from 'node:fs/promises'
import {
  chunkUploads,
  chunkHash,
  removeChunkUpload,
  UPLOAD_CHUNK_SIZE,
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
  try {
    if (event.method === 'POST') {
      if (upload.completed) return { ok: true, key: upload.key }
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
    return { ok: true }
  } finally {
    if (event.method === 'POST') upload.busy = false
    if (activeIndex !== undefined) upload.activeParts.delete(activeIndex)
    upload.touched = Date.now()
    if (upload.cancelled) await removeChunkUpload(id)
  }
})
