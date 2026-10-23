/** Internal worker protocol; never carries long-lived storage credentials. */
export interface CloudLease {
  id: string
  siteId: number
  photoId: string
  sourceVersion: string
  pipelineVersion: string
  attemptId: string
  workerId: string
  attempts: number
  connectionRevision: number
  connectionId: string
  objectKey: string
  expectedBytes: number
}
export interface CloudMediaResult {
  width: number
  height: number
  /** JSON-safe metadata, independently size-limited before persistence. */
  metadata: Record<string, unknown>
  assets: {
    role: 'thumbnail' | 'live-video' | 'display'
    objectKey: string
    bytes: number
    contentType: string
  }[]
}
export interface CloudExecutionRepository {
  claim(
    workerId: string,
    attemptId: string,
    now: number,
    leaseMs: number,
  ): Promise<CloudLease | null>
  heartbeat(lease: CloudLease, now: number, leaseMs: number): Promise<boolean>
  complete(
    lease: CloudLease,
    result: CloudMediaResult,
    now: number,
  ): Promise<boolean>
  fail(
    lease: CloudLease,
    code: string,
    retryable: boolean,
    now: number,
  ): Promise<boolean>
}
