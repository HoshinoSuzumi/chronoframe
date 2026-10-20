import type { Photo } from './resources.ts'

export interface UploadPart {
  partNumber: number
  etag: string
}

export type UploadPlan =
  | {
      mode: 'single'
      url: string
      method?: 'PUT' | 'POST'
      headers?: Record<string, string>
    }
  | {
      mode: 'range'
      url: string
      partSize: number
      method?: 'PUT' | 'POST'
      headers?: Record<string, string>
    }
  | {
      mode: 'chunks'
      url: string
    }
  | {
      mode: 'multipart'
      url: string
      partSize: number
      partUrls: string[]
    }

export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024

/** Public duplicate summary returned by upload preparation, without internal columns. */
export type UploadDuplicateSummary = Pick<
  Photo,
  'id' | 'title' | 'storageKey' | 'originalUrl' | 'thumbnailUrl' | 'dateTaken'
>

export interface PreparedUploadResponse {
  skipped?: false
  signedUrl: string
  upload: UploadPlan
  fileKey: string
  expiresIn: number
  duplicate?: boolean
  existingPhoto?: UploadDuplicateSummary
  warningInfo?: {
    title: string
    message: string
    warning: string
    info: string
  }
}

export interface SkippedUploadResponse {
  skipped: true
  duplicate: true
  existingPhoto: UploadDuplicateSummary
  fileKey: string
  title: string
  message: string
  info: string
}

export type UploadPreparationResponse =
  | PreparedUploadResponse
  | SkippedUploadResponse
