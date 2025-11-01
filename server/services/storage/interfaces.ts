import type { StorageConfig } from '.'

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
