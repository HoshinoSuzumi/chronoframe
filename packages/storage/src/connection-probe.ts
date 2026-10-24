import type { StorageConnectionErrorCode } from '@chronoframe/contracts/storage-diagnostics'
export type StorageProbeStage =
  | 'configuration'
  | 'write'
  | 'read'
  | 'signed_read'
  | 'multipart'
  | 'multipart_create'
  | 'multipart_list'
  | 'multipart_abort'
  | 'cors'
  | 'cleanup'
export class StorageConnectionError extends Error {
  readonly code: StorageConnectionErrorCode
  readonly stage: StorageProbeStage
  readonly providerCode?: string
  readonly providerStatus?: number
  constructor(stage: StorageProbeStage, upstream?: unknown) {
    super('Storage connection check failed')
    this.name = 'StorageConnectionError'
    this.stage = stage
    this.code = `storage_${stage}_failed`
    // Only explicit protocol codes and an HTTP status may cross the boundary.
    // Never retain provider messages, response bodies, request IDs or URLs.
    if (upstream && typeof upstream === 'object') {
      const source = upstream as {
        name?: unknown
        $metadata?: { httpStatusCode?: unknown }
      }
      if (
        typeof source.name === 'string' &&
        [
          'AccessDenied',
          'InvalidAccessKeyId',
          'SignatureDoesNotMatch',
          'NoSuchBucket',
          'NoSuchUpload',
          'NotImplemented',
          'InvalidRequest',
          'InvalidArgument',
          'MalformedXML',
          'InternalError',
          'ServiceUnavailable',
          'SlowDown',
          'RequestTimeout',
        ].includes(source.name)
      )
        this.providerCode = source.name
      const status = source.$metadata?.httpStatusCode
      if (
        typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 400 &&
        status <= 599
      )
        this.providerStatus = status
    }
  }
}
export interface StorageProbeClient {
  put(key: string, body: Uint8Array, contentType: string): Promise<unknown>
  head(key: string): Promise<{ bytes: number }>
  getProbe(key: string): Promise<Uint8Array | undefined>
  signGet(key: string): Promise<string>
  multipart(key: string, contentType: string): Promise<string>
  recoverMultipart(key: string): Promise<string[]>
  parts(key: string, uploadId: string): Promise<readonly unknown[]>
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
    const operation = async <T>(
      step: StorageProbeStage,
      run: () => Promise<T>,
    ) => {
      try {
        return await run()
      } catch (error) {
        throw new StorageConnectionError(step, error)
      }
    }
    const id = await operation('multipart_create', () =>
      s3.multipart(key, 'application/octet-stream'),
    )
    let multipartFailure: StorageConnectionError | undefined
    try {
      const ids = await operation('multipart_list', () =>
        s3.recoverMultipart(key),
      )
      // Upload IDs are opaque handles. Some S3-compatible services return a
      // different usable handle when listing the same upload. Validate capability
      // instead of assuming the create and list strings must be identical.
      if (!ids.length) throw new StorageConnectionError('multipart_list')
      for (const handle of new Set([id, ids[0]!])) {
        const parts = await operation('multipart_list', () =>
          s3.parts(key, handle),
        )
        // This random-key probe has not uploaded any parts.
        if (parts.length) throw new StorageConnectionError('multipart_list')
      }
    } catch (error) {
      multipartFailure = error as StorageConnectionError
    }
    try {
      await operation('multipart_abort', () => s3.abort(key, id))
    } catch (error) {
      multipartFailure ??= error as StorageConnectionError
    }
    if (multipartFailure) throw multipartFailure
    stage = 'cors'
    if (!(await s3.browserCors(origin, key)))
      throw new Error('Browser CORS failed')
  } catch (error) {
    failure =
      error instanceof StorageConnectionError
        ? error
        : new StorageConnectionError(stage, error)
  } finally {
    // The PUT may have succeeded even when its response was lost.
    try {
      await s3.remove(key)
    } catch (error) {
      failure ??= new StorageConnectionError('cleanup', error)
    }
  }
  if (failure) throw failure
}
