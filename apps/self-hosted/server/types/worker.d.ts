import type { WorkerPool } from '../services/pipeline-queue'
declare global {
  var __workerPool: WorkerPool | undefined
}
export {}
