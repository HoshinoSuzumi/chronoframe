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
