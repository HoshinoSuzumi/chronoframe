import type { SiteContext } from '@chronoframe/core'
import type { PipelineQueuePayload } from '@chronoframe/contracts/queue'

export const PIPELINE_VERSION = '1'
export const DEFAULT_LEASE_MS = 60_000
export interface JobLease {
  id: number
  siteId: number
  resourceId: string | null
  payload: PipelineQueuePayload
  sourceVersion: number
  pipelineVersion: string
  attemptId: string
  workerId: string
  attempts: number
  maxAttempts: number
  storageConnectionId: number | null
  storageRevision: number
}
export class LostLeaseError extends Error {}
export class PermanentJobError extends Error {}
export interface JobRepository {
  claim(workerId: string, now: Date, leaseMs: number): Promise<JobLease | null>
  heartbeat(lease: JobLease, now: Date, leaseMs: number): Promise<boolean>
  complete(lease: JobLease, now: Date): Promise<boolean>
  fail(
    lease: JobLease,
    error: string,
    retryable: boolean,
    now: Date,
  ): Promise<boolean>
}
export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), 30_000)
}
/** Run one lease, retaining a native processing slot until its work has settled. */
export async function runOneJob(deps: {
  repository: JobRepository
  workerId: string
  site: SiteContext
  process(lease: JobLease, signal: AbortSignal): Promise<void>
  now?: () => Date
  leaseMs?: number
  heartbeatMs?: number
  onError?(error: unknown): void
}) {
  const now = deps.now ?? (() => new Date()),
    leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS
  const lease = await deps.repository.claim(deps.workerId, now(), leaseMs)
  if (!lease) return 'idle' as const
  if (lease.siteId !== deps.site.id)
    throw new PermanentJobError('Claimed job belongs to a different Site')
  const controller = new AbortController()
  let heartbeatRunning = false,
    leaseLost = false
  const timer = setInterval(
    () => {
      if (heartbeatRunning) return
      heartbeatRunning = true
      void deps.repository
        .heartbeat(lease, now(), leaseMs)
        .then((valid) => {
          if (!valid) {
            leaseLost = true
            controller.abort(new LostLeaseError('Lease or source changed'))
          }
        })
        .catch((error) => {
          controller.abort(error)
          deps.onError?.(error)
        })
        .finally(() => {
          heartbeatRunning = false
        })
    },
    deps.heartbeatMs ?? Math.max(10, Math.floor(leaseMs / 3)),
  )
  try {
    await deps.process(lease, controller.signal)
    controller.signal.throwIfAborted()
    const completed = await deps.repository.complete(lease, now())
    if (!completed)
      await deps.repository.fail(lease, 'Job result discarded', false, now())
    return completed ? ('completed' as const) : ('discarded' as const)
  } catch (error) {
    await deps.repository.fail(
      lease,
      error instanceof Error ? error.message : 'Job failed',
      !(
        error instanceof PermanentJobError ||
        error instanceof LostLeaseError ||
        leaseLost
      ),
      now(),
    )
    deps.onError?.(error)
    return 'failed' as const
  } finally {
    clearInterval(timer)
  }
}
