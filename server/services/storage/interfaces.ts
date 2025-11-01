import { z } from 'zod'

export const s3StorageConfigSchema = z.object({
  provider: z.literal('s3'),
  bucket: z.string().optional(),
  region: z.string().optional(),
  endpoint: z.string().optional(),
  prefix: z.string().optional(),
  cdnUrl: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  maxKeys: z.number().optional(),
})

export const localStorageConfigSchema = z.object({
  provider: z.literal('local'),
  basePath: z.string().min(1),
  baseUrl: z.string().optional(),
  prefix: z.string().optional(),
})

export const openListStorageConfigSchema = z.object({
  provider: z.literal('openlist'),
  baseUrl: z.string().min(1),
  rootPath: z.string().min(1),
  token: z.string().min(1),
  endpoints: z.object({
    upload: z.string(),
    download: z.string(),
    list: z.string(),
    delete: z.string(),
    meta: z.string(),
  }),
  pathField: z.string().optional(),
  cdnUrl: z.string().optional(),
})

export const storageConfigSchema = z.discriminatedUnion('provider', [
  s3StorageConfigSchema,
  localStorageConfigSchema,
  openListStorageConfigSchema,
])

export type StorageConfig = z.infer<typeof storageConfigSchema>

export type S3StorageConfig = z.infer<typeof s3StorageConfigSchema>
export type LocalStorageConfig = z.infer<typeof localStorageConfigSchema>
export type OpenListStorageConfig = z.infer<typeof openListStorageConfigSchema>

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
