export interface StorageObject {
  key: string
  size?: number
  etag?: string
  lastModified?: Date
}

export type S3StorageConfig = {
  provider: 's3'
  bucket?: string
  region?: string
  endpoint?: string
  prefix?: string
  cdnUrl?: string
  accessKeyId?: string
  secretAccessKey?: string
  forcePathStyle?: boolean
  maxKeys?: number
}

export type HubR2StorageConfig = {
  provider: 'hub-r2'
  prefix?: string
  maxKeys?: number
  cdnUrl?: string
}

export type LocalStorageConfig = {
  provider: 'local'
  /** Absolute directory where files are stored */
  basePath: string
  /** Public base URL to serve files, e.g. /storage or https://domain.com/storage */
  baseUrl?: string
  /** Optional prefix for logical keys within basePath */
  prefix?: string
}

export type OpenListStorageConfig = {
  provider: 'openlist'
  baseUrl: string
  rootPath: string
  token: string
  endpoints: {
    upload: string
    download: string
    list: string
    delete: string
    meta: string
  }
  pathField?: string
  cdnUrl?: string
}

export type StorageConfig =
  | S3StorageConfig
  | HubR2StorageConfig
  | LocalStorageConfig
  | OpenListStorageConfig

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
