import type { UploadPart } from '@chronoframe/contracts/upload'
import { CoreError } from './errors.ts'

export interface MultipartSession {
  owner: string
  key: string
  busy: boolean
  cancelled: boolean
  completed: boolean
  touched: number
  setup: {
    partUrls: readonly string[]
    complete(parts: UploadPart[]): Promise<void>
  }
}
export interface MultipartSessionRepository {
  get(id: string): MultipartSession | undefined
  abort(id: string): Promise<void>
}

/** Complete a user-owned multipart session once, reserving it before reading request data. */
export function createMultipartCompleter(deps: {
  sessions: MultipartSessionRepository
  now(): number
  event(
    name: string,
    details: Record<string, string | number | boolean | undefined>,
    error?: unknown,
  ): void
}) {
  return async (
    id: string,
    owner: string,
    readParts: () => Promise<unknown>,
  ) => {
    const session = deps.sessions.get(id)
    if (!session || session.owner !== owner)
      throw new CoreError(404, 'Upload session not found')
    if (session.cancelled) throw new CoreError(410, 'Upload cancelled')
    if (session.busy) throw new CoreError(409, 'Upload is busy')
    if (session.completed) {
      deps.event('multipart.complete.repeated', {
        sessionId: id,
        key: session.key,
      })
      return { ok: true, key: session.key }
    }
    session.busy = true
    session.touched = deps.now()
    const startedAt = deps.now()
    deps.event('multipart.complete.started', {
      sessionId: id,
      key: session.key,
      partCount: session.setup.partUrls.length,
    })
    try {
      const raw = await readParts()
      if (
        !Array.isArray(raw) ||
        raw.length !== session.setup.partUrls.length ||
        raw.some(
          (part, index) =>
            !part ||
            part.partNumber !== index + 1 ||
            typeof part.etag !== 'string' ||
            !part.etag ||
            part.etag.length > 256,
        )
      ) {
        throw new CoreError(400, 'Invalid multipart completion data')
      }
      if (session.cancelled) throw new CoreError(410, 'Upload cancelled')
      await session.setup.complete(raw)
      session.completed = true
      deps.event('multipart.complete.succeeded', {
        sessionId: id,
        key: session.key,
        partCount: raw.length,
        durationMs: deps.now() - startedAt,
      })
      return { ok: true, key: session.key }
    } catch (error) {
      deps.event(
        'multipart.complete.failed',
        { sessionId: id, key: session.key, durationMs: deps.now() - startedAt },
        error,
      )
      throw error
    } finally {
      session.busy = false
      session.touched = deps.now()
      if (session.cancelled) await deps.sessions.abort(id)
    }
  }
}

/** Validate Local chunk completeness before publishing through caller-owned file I/O. */
export async function completeLocalUpload(input: {
  completed: boolean
  cancelled: boolean
  key: string
  size: number
  partSize: number
  receivedParts: number
  fileSize(): Promise<number>
  publish(): Promise<void>
  cleanup(): Promise<void>
  markCompleted(): void
}) {
  if (input.cancelled) throw new CoreError(410, 'Upload cancelled')
  if (input.completed) return { ok: true, key: input.key }
  if (
    input.receivedParts !== Math.ceil(input.size / input.partSize) ||
    (await input.fileSize()) !== input.size
  )
    throw new CoreError(400, 'Upload is incomplete')
  await input.publish()
  input.markCompleted()
  await input.cleanup().catch(() => {})
  return { ok: true, key: input.key }
}
