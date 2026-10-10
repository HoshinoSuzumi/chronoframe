import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { StorageProvider } from '../services/storage/interfaces'
import { logUpload } from './upload-log'
import { UPLOAD_CHUNK_SIZE } from '../../shared/utils/upload'

const TTL = 60 * 60 * 1000
export const chunkUploads = new Map<string, ChunkUpload>()

interface ChunkUpload {
  owner: string
  key: string
  size: number
  contentType: string
  provider: StorageProvider
  directory: string
  filePath: string
  hashes: Map<number, string>
  activeParts: Set<number>
  cancelled: boolean
  busy: boolean
  completed: boolean
  touched: number
}

export const chunkHash = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex')

export async function removeChunkUpload(id: string) {
  const upload = chunkUploads.get(id)
  if (!upload) return
  upload.cancelled = true
  if (upload.busy || upload.activeParts.size) return
  await rm(upload.directory, { recursive: true, force: true })
  chunkUploads.delete(id)
  logUpload('local.session.removed', {
    sessionId: id,
    key: upload.key,
    completed: upload.completed,
    receivedParts: upload.hashes.size,
  })
}

export async function createChunkUpload(
  owner: string,
  key: string,
  size: number,
  contentType: string,
  provider: StorageProvider,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-upload-'))
  const id = randomUUID()
  await writeFile(path.join(directory, 'file'), Buffer.alloc(0))
  chunkUploads.set(id, {
    owner,
    key,
    size,
    contentType,
    provider,
    directory,
    filePath: path.join(directory, 'file'),
    hashes: new Map(),
    activeParts: new Set(),
    cancelled: false,
    busy: false,
    completed: false,
    touched: Date.now(),
  })
  logUpload('local.session.created', {
    sessionId: id,
    owner,
    key,
    size,
    partSize: UPLOAD_CHUNK_SIZE,
    partCount: Math.ceil(size / UPLOAD_CHUNK_SIZE),
  })
  return `/api/photos/chunks/${id}`
}

const cleanup = setInterval(() => {
  for (const [id, upload] of chunkUploads) {
    if (
      !upload.busy &&
      !upload.activeParts.size &&
      Date.now() - upload.touched > TTL
    ) {
      logUpload('local.session.expired', { sessionId: id, key: upload.key })
      void removeChunkUpload(id).catch((error) =>
        logUpload(
          'local.cleanup.failed',
          { sessionId: id, key: upload.key },
          error,
        ),
      )
    }
  }
}, 60_000)
cleanup.unref()
