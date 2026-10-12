import type { Photo as DatabasePhoto } from '../../server/utils/db'
import type { WorkerPool } from '../../server/services/pipeline-queue'

declare global {
  var __workerPool: WorkerPool | undefined
  interface Photo extends DatabasePhoto {
    fileName?: string | null
  }
}

export {}
