import type { StorageConfig } from '.'
import type { UploadPart, UploadPlan } from '../../../shared/types/upload'

export type DirectUploadSetup =
  | Extract<UploadPlan, { mode: 'single' | 'range' }>
  | {
      mode: 'multipart'
      partSize: number
      partUrls: string[]
      complete(parts: UploadPart[]): Promise<void>
      abort(): Promise<void>
    }

export interface StorageObject {
  key: string
  size?: number
  etag?: string
  lastModified?: Date
}

export interface UploadOptions {
  contentType?: string
  metadata?: Record<string, string>
  encryption?: boolean
  ttl?: number
}

export interface StorageProvider {
  config?: StorageConfig
  prepareDirectUpload?(
    key: string,
    size: number,
    contentType: string,
  ): Promise<DirectUploadSetup | null>
  createFromFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<StorageObject>
  create(
    key: string,
    fileBuffer: Buffer,
    contentType?: string,
  ): Promise<StorageObject>
  delete(key: string): Promise<void>
  get(key: string): Promise<Buffer | null>
  getPublicUrl(key: string): string
  getSignedUrl?(
    key: string,
    expiresIn?: number,
    options?: UploadOptions,
  ): Promise<string>
  getFileMeta(key: string): Promise<StorageObject | null>
  listAll(): Promise<StorageObject[]>
  listImages(): Promise<StorageObject[]>
}
