import type { WorkerPool } from '../../server/services/pipeline-queue'

declare global {
  var __workerPool: WorkerPool | undefined
}

export {}
