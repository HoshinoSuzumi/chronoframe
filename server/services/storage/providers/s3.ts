import type { _Object, S3ClientConfig } from '@aws-sdk/client-s3'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type {
  StorageObject,
  StorageProvider,
  UploadOptions,
  DirectUploadSetup,
} from '../interfaces'
import { UPLOAD_CHUNK_SIZE } from '../../../../shared/utils/upload'

const createClient = (config: S3StorageConfig): S3Client => {
  if (config.provider !== 's3') {
    throw new Error('Invalid provider for S3 client creation')
  }

  const { accessKeyId, secretAccessKey, region, endpoint } = config
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing required accessKeyId or secretAccessKey')
  }

  const clientConfig: S3ClientConfig = {
    endpoint,
    region,
    forcePathStyle: config.forcePathStyle,
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  }

  return new S3Client(clientConfig)
}

const convertToStorageObject = (s3object: _Object): StorageObject => {
  return {
    key: s3object.Key || '',
    size: s3object.Size,
    lastModified: s3object.LastModified,
    etag: s3object.ETag,
  }
}

export class S3StorageProvider implements StorageProvider {
  config: S3StorageConfig
  private logger?: Logger['storage']
  private client: S3Client

  constructor(config: S3StorageConfig, logger?: Logger['storage']) {
    this.config = config
    this.logger = logger
    this.client = createClient(config)
  }

  async create(
    key: string,
    data: Buffer,
    contentType?: string,
  ): Promise<StorageObject> {
    try {
      const absoluteKey =
        `${(this.config.prefix || '').replace(/\/+$/, '')}/${key}`.replace(
          /^\/+/,
          '',
        )
      const cmd = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: absoluteKey,
        Body: data,
        ContentType: contentType || 'application/octet-stream',
      })

      const resp = await this.client.send(cmd)

      this.logger?.success(`Created object with key: ${absoluteKey}`)

      return {
        key: absoluteKey,
        size: data.length,
        lastModified: new Date(),
        etag: resp.ETag,
      }
    } catch (error) {
      this.logger?.error(`Failed to create object with key: ${key}`, error)
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const cmd = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })

      await this.client.send(cmd)
      this.logger?.success(`Deleted object with key: ${key}`)
    } catch (error) {
      this.logger?.error(`Failed to delete object with key: ${key}`, error)
      throw error
    }
  }

  async createFromFile(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<StorageObject> {
    const { size } = await stat(filePath)
    const body = createReadStream(filePath)
    try {
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentLength: size,
          ContentType: contentType,
        }),
      )
      return { key, size, etag: result.ETag }
    } finally {
      body.destroy()
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const cmd = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })

      const resp = await this.client.send(cmd)

      if (!resp.Body) {
        return null
      }

      if (resp.Body instanceof Buffer) {
        return resp.Body
      }

      const chunks: Uint8Array[] = []
      const stream = resp.Body as NodeJS.ReadableStream

      return new Promise<Buffer>((resolve, reject) => {
        stream.on('data', (chunk: Uint8Array) => {
          chunks.push(chunk)
        })

        stream.on('end', () => {
          resolve(Buffer.concat(chunks))
        })

        stream.on('error', (err) => {
          reject(err)
        })
      })
    } catch {
      return null
    }
  }

  getPublicUrl(key: string): string {
    const { cdnUrl, bucket, region, endpoint } = this.config

    // CDN URL
    if (cdnUrl) {
      return `${cdnUrl.replace(/\/$/, '')}/${key}`
    }

    // Default AWS S3 endpoint
    if (!endpoint) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    } else if (endpoint.includes('amazonaws.com')) {
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
    }

    // Alibaba Cloud OSS
    if (endpoint.includes('aliyuncs.com')) {
      const baseUrl = endpoint.replace(/\/$/, '')
      if (baseUrl.indexOf('//') === -1) {
        throw new Error('Invalid endpoint URL')
      }
      const protocol = baseUrl.split('//')[0]
      const remainder = baseUrl.split('//')[1]
      return `${protocol}//${bucket}.${remainder}/${key}`
    }

    // Custom endpoint
    return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`
  }

  async getSignedUrl(
    key: string,
    expiresIn: number = 3600,
    options?: UploadOptions,
  ): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: options?.contentType || 'application/octet-stream',
    })

    const url = await getSignedUrl(this.client, cmd, {
      expiresIn,
      // 为了更好的 CORS 支持，添加一些额外参数
      unhoistableHeaders: new Set(['Content-Type']),
    })
    return url
  }

  async prepareDirectUpload(
    key: string,
    size: number,
    contentType: string,
  ): Promise<DirectUploadSetup> {
    const single = async (): Promise<DirectUploadSetup> => ({
      mode: 'single',
      url: await this.getSignedUrl(key, 3600, { contentType }),
    })
    if (size <= UPLOAD_CHUNK_SIZE) return single()
    const base = { Bucket: this.config.bucket, Key: key }
    let uploadId: string | undefined
    try {
      uploadId = (
        await this.client.send(
          new CreateMultipartUploadCommand({
            ...base,
            ContentType: contentType,
          }),
        )
      ).UploadId
    } catch (error) {
      const unsupported = error as {
        name?: string
        Code?: string
        $metadata?: { httpStatusCode?: number }
      }
      if (
        [405, 501].includes(unsupported.$metadata?.httpStatusCode ?? 0) ||
        [
          'NotImplemented',
          'NotSupported',
          'UnsupportedOperation',
          'AccessDenied',
        ].includes(unsupported.name || unsupported.Code || '')
      ) {
        // A provider can allow ordinary PUT uploads while denying multipart
        // initiation. Keep the file on the direct path in that case.
        this.logger?.warn(
          `Multipart initialization rejected (${unsupported.name || unsupported.Code || unsupported.$metadata?.httpStatusCode}); falling back to direct PUT`,
        )
        return single()
      }
      throw error
    }
    if (!uploadId) throw new Error('S3 did not return a multipart upload ID')
    const params = { ...base, UploadId: uploadId }
    const abort = async () => {
      await this.client.send(new AbortMultipartUploadCommand(params))
    }
    const partSize = Math.max(
      UPLOAD_CHUNK_SIZE,
      Math.ceil(size / 10_000 / 1024 / 1024) * 1024 * 1024,
    )
    const count = Math.ceil(size / partSize)
    try {
      const partUrls = await Promise.all(
        Array.from({ length: count }, (_, index) =>
          getSignedUrl(
            this.client,
            new UploadPartCommand({ ...params, PartNumber: index + 1 }),
            { expiresIn: 3600 },
          ),
        ),
      )
      return {
        mode: 'multipart',
        partSize,
        partUrls,
        abort,
        complete: async (parts) => {
          // Verify remote part sizes before publishing the object. Presigned
          // upload URLs alone do not enforce the declared total file size.
          const remote = new Map<number, { size?: number; etag?: string }>()
          let marker: string | undefined
          do {
            const result = await this.client.send(
              new ListPartsCommand({ ...params, PartNumberMarker: marker }),
            )
            for (const part of result.Parts || []) {
              if (part.PartNumber !== undefined)
                remote.set(part.PartNumber, {
                  size: part.Size,
                  etag: part.ETag,
                })
            }
            marker = result.IsTruncated
              ? result.NextPartNumberMarker
              : undefined
          } while (marker)
          if (
            remote.size !== count ||
            parts.some((part) => {
              const uploaded = remote.get(part.partNumber)
              return (
                uploaded?.etag !== part.etag ||
                uploaded?.size !==
                  Math.min(partSize, size - (part.partNumber - 1) * partSize)
              )
            })
          )
            throw new Error('S3 multipart upload size or ETag mismatch')
          await this.client.send(
            new CompleteMultipartUploadCommand({
              ...params,
              MultipartUpload: {
                Parts: parts.map((part) => ({
                  PartNumber: part.partNumber,
                  ETag: part.etag,
                })),
              },
            }),
          )
        },
      }
    } catch (error) {
      await abort().catch(() => {})
      throw error
    }
  }

  async getFileMeta(key: string): Promise<StorageObject | null> {
    try {
      const cmd = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })

      const resp = await this.client.send(cmd)

      if (!resp.ETag) {
        return null
      }

      return {
        key,
        size: resp.ContentLength || 0,
        lastModified: resp.LastModified,
        etag: resp.ETag,
      }
    } catch (error) {
      if ((error as any).$metadata?.httpStatusCode === 404) {
        return null
      }
      this.logger?.error(`Failed to get metadata for key: ${key}`, error)
      throw error
    }
  }

  async listAll(): Promise<StorageObject[]> {
    const cmd = new ListObjectsCommand({
      Bucket: this.config.bucket,
      Prefix: this.config.prefix,
      MaxKeys: this.config.maxKeys,
    })

    const resp = await this.client.send(cmd)
    this.logger?.log(resp.Contents?.map(convertToStorageObject))
    return resp.Contents?.map(convertToStorageObject) || []
  }

  async listImages(): Promise<StorageObject[]> {
    const cmd = new ListObjectsCommand({
      Bucket: this.config.bucket,
      Prefix: this.config.prefix,
      MaxKeys: this.config.maxKeys,
    })

    const resp = await this.client.send(cmd)
    // TODO: filter supported image format
    return resp.Contents?.map(convertToStorageObject) || []
  }
}
