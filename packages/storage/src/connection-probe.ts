import type { StorageConnectionErrorCode } from '@chronoframe/contracts/storage-diagnostics'
export type StorageProbeStage =
  | 'configuration'
  | 'write'
  | 'read'
  | 'signed_read'
  | 'multipart'
  | 'cors'
  | 'cleanup'
export class StorageConnectionError extends Error {
  readonly code: StorageConnectionErrorCode
  readonly stage: StorageProbeStage
  constructor(stage: StorageProbeStage) {
    super('Storage connection check failed')
    this.name = 'StorageConnectionError'
    this.stage = stage
    this.code = `storage_${stage}_failed`
  }
}
export interface StorageProbeClient {
  put(key: string, body: Uint8Array, contentType: string): Promise<unknown>
  head(key: string): Promise<{ bytes: number }>
  getProbe(key: string): Promise<Uint8Array | undefined>
  signGet(key: string): Promise<string>
  multipart(key: string, contentType: string): Promise<string>
  recoverMultipart(key: string): Promise<string[]>
  abort(key: string, uploadId: string): Promise<unknown>
  browserCors(origin: string, key: string): Promise<boolean>
  remove(key: string): Promise<unknown>
}
/** Check only object-scoped operations. Provider errors are replaced with fixed codes. */
export async function probeStorageConnection(
  s3: StorageProbeClient,
  origin: string,
  request: typeof fetch = fetch,
) {
  const key = 'chronoframe/connection-check/' + crypto.randomUUID()
  const sample = crypto.getRandomValues(new Uint8Array(32))
  let stage: StorageProbeStage = 'write',
    failure: StorageConnectionError | undefined
  try {
    await s3.put(key, sample, 'application/octet-stream')
    stage = 'read'
    const head = await s3.head(key),
      bytes = await s3.getProbe(key)
    if (
      head.bytes !== sample.length ||
      !bytes ||
      bytes.length !== sample.length ||
      bytes.some((v, i) => v !== sample[i])
    )
      throw new Error('Probe mismatch')
    stage = 'signed_read'
    const response = await request(await s3.signGet(key), {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    try {
      if (!response.ok) throw new Error('Signed access failed')
    } finally {
      await response.body?.cancel().catch(() => undefined)
    }
    stage = 'multipart'
    const id = await s3.multipart(key, 'application/octet-stream')
    try {
      if (!(await s3.recoverMultipart(key)).includes(id))
        throw new Error('Multipart recovery failed')
    } finally {
      await s3.abort(key, id)
    }
    stage = 'cors'
    if (!(await s3.browserCors(origin, key)))
      throw new Error('Browser CORS failed')
  } catch {
    failure = new StorageConnectionError(stage)
  } finally {
    // The PUT may have succeeded even when its response was lost.
    try {
      await s3.remove(key)
    } catch {
      failure ??= new StorageConnectionError('cleanup')
    }
  }
  if (failure) throw failure
}
