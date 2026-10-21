import type { UploadPreparationResponse } from '@chronoframe/contracts/upload'
import type { UploadQueueStatus } from '~~/shared/utils/upload-status'

export interface UploadingFile {
  file: File
  fileName: string
  fileId: string
  status: UploadQueueStatus
  stage?: string | null
  progress?: number
  error?: string
  warning?: string
  taskId?: number
  signedUrlResponse?: UploadPreparationResponse
  uploadProgress?: {
    loaded: number
    total: number
    percentage: number
    speed?: number
    timeRemaining?: number
    speedText?: string
    timeRemainingText?: string
  }
  canAbort?: boolean
  abortUpload?: () => void
}
