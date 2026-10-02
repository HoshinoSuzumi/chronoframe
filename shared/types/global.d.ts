import type { WorkerPool } from '../../server/services/pipeline-queue'

declare global {
  var __workerPool: WorkerPool | undefined
  interface Photo {
    fileName?: string | null
  }
}

export {}
