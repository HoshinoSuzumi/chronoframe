import { randomUUID } from 'node:crypto'
import type {
  DirectUploadSetup,
  StorageProvider,
} from '../services/storage/interfaces'
import type { UploadPlan } from '../../shared/types/upload'
import { createChunkUpload } from './chunk-upload'

export const directUploads = new Map<
  string,
  {
    owner: string
    key: string
    setup: Extract<DirectUploadSetup, { mode: 'multipart' }>
    busy: boolean
    cancelled: boolean
    completed: boolean
    touched: number
  }
>()

export async function abortDirectUpload(id: string) {
  const session = directUploads.get(id)
  if (!session) return
  session.cancelled = true
  if (session.busy) return
  if (!session.completed) await session.setup.abort()
  directUploads.delete(id)
}

export async function prepareUpload(
  owner: string,
  key: string,
  size: number,
  contentType: string,
  provider: StorageProvider,
  chunked: boolean,
): Promise<UploadPlan> {
  if (provider.prepareDirectUpload && Number.isSafeInteger(size) && size > 0) {
    const setup = await provider.prepareDirectUpload(key, size, contentType)
    if (setup?.mode === 'single' || setup?.mode === 'range') return setup
    if (setup?.mode === 'multipart') {
      const id = randomUUID()
      directUploads.set(id, {
        owner,
        key,
        setup,
        busy: false,
        cancelled: false,
        completed: false,
        touched: Date.now(),
      })
      return {
        mode: 'multipart',
        url: `/api/photos/multipart/${id}`,
        partSize: setup.partSize,
        partUrls: setup.partUrls,
      }
    }
  }
  if (provider.getSignedUrl) {
    return {
      mode: 'single',
      url: await provider.getSignedUrl(key, 3600, { contentType }),
    }
  }
  if (chunked && provider.config?.provider === 'local') {
    return {
      mode: 'chunks',
      url: await createChunkUpload(owner, key, size, contentType, provider),
    }
  }
  return {
    mode: 'single',
    url: `/api/photos/upload?key=${encodeURIComponent(key)}`,
  }
}

const cleanup = setInterval(() => {
  for (const [id, session] of directUploads) {
    if (!session.busy && Date.now() - session.touched > 60 * 60_000) {
      void abortDirectUpload(id).catch((error) =>
        console.error('Multipart cleanup failed', error),
      )
    }
  }
}, 60_000)
cleanup.unref()
