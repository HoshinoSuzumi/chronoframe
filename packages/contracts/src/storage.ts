import { z } from 'zod'

export const s3StorageConfigSchema = z.object({
  provider: z.literal('s3'),
  bucket: z.string(),
  region: z.string().default('auto'),
  endpoint: z.string(),
  prefix: z.string().default('/photos').optional(),
  cdnUrl: z.string().optional(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
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
  uploadEndpoint: z.string().default('/api/fs/put').optional(),
  downloadEndpoint: z.string().optional(),
  listEndpoint: z.string().optional(),
  deleteEndpoint: z.string().default('/api/fs/remove').optional(),
  metaEndpoint: z.string().default('/api/fs/get').optional(),
  pathField: z.string().default('path').optional(),
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
