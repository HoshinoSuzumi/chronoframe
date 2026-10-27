import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetBucketCorsCommand,
  ListPartsCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'

export interface CloudS3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}
/** Trusted provider endpoints are still one S3 implementation. Custom S3 hosts
 * require an operator allowlist: arbitrary user DNS cannot bypass egress policy.
 */
export function validateCloudS3(
  config: CloudS3Config,
  allowedHosts: readonly string[] = [],
) {
  const endpoint = new URL(config.endpoint)
  const host = endpoint.hostname
  const trusted =
    /^(?:s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?|[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com)$/.test(
      host,
    )
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash ||
    (!trusted && !allowedHosts.includes(host)) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) ||
    /\.\.|^\d+\.\d+\.\d+\.\d+$/.test(config.bucket) ||
    !/^[a-z0-9-]{1,40}$/.test(config.region) ||
    !config.accessKeyId ||
    config.accessKeyId.length > 256 ||
    !config.secretAccessKey ||
    config.secretAccessKey.length > 256
  )
    throw new Error('Unsupported S3 configuration')
  // Even operator configuration cannot authorize loopback, literal/private IPs,
  // ambiguous numeric addresses, local names or DNS metadata endpoints.
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
    !host.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|metadata|invalid)$/.test(host) ||
    /^(?:\d+\.)*\d+$/.test(host) ||
    host === 'metadata.google.internal'
  )
    throw new Error('Unsafe S3 endpoint')
  return endpoint.origin
}
export function createCloudS3(
  config: CloudS3Config,
  options: { allowedHosts?: readonly string[]; fetch?: typeof fetch } = {},
) {
  const endpoint = validateCloudS3(config, options.allowedHosts)
  const transport = options.fetch ?? fetch
  const client = new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    maxAttempts: 2,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: new FetchHttpHandler({
      requestTimeout: 15000,
      requestInit: () => ({ redirect: 'manual' }),
      customFetch: async (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        )
        if (url.origin !== endpoint)
          throw new Error('Unexpected S3 destination')
        const response = await transport(input, { ...init, redirect: 'manual' })
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel()
          throw new Error('S3 redirect refused')
        }
        return response
      },
    }),
  })
  const Bucket = config.bucket
  const safeKey = (key: string) => {
    if (
      !key ||
      key.length > 1024 ||
      key.startsWith('/') ||
      key.split('/').some((p) => !p || p === '.' || p === '..') ||
      Array.from(key).some((c) => c.charCodeAt(0) < 32 || c === '\\')
    )
      throw new Error('Invalid object key')
    return key
  }
  return {
    async signGet(key: string, expiresIn = 60) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket, Key: safeKey(key) }),
        { expiresIn },
      )
    },
    async signPut(
      key: string,
      bytes: number,
      contentType: string,
      expiresIn = 300,
    ) {
      if (
        !Number.isSafeInteger(bytes) ||
        bytes < 1 ||
        bytes > 1024 * 1024 * 1024
      )
        throw new Error('Invalid upload size')
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket,
          Key: safeKey(key),
          ContentLength: bytes,
          ContentType: contentType,
        }),
        { expiresIn },
      )
    },
    async head(key: string) {
      const r = await client.send(
        new HeadObjectCommand({ Bucket, Key: safeKey(key) }),
      )
      return {
        bytes: r.ContentLength ?? 0,
        contentType: r.ContentType ?? '',
        etag: r.ETag ?? '',
      }
    },
    /** Bounded tenant-prefix cleanup, never a bucket-wide delete. Repeat until empty. */
    async purgeTenant(siteId: number) {
      if (!Number.isSafeInteger(siteId) || siteId < 1)
        throw new Error('Invalid site')
      const prefix = `chronoframe/${siteId}/`
      let versioned = false
      try {
        const status = await client.send(
          new GetBucketVersioningCommand({ Bucket }),
        )
        versioned = status.Status === 'Enabled' || status.Status === 'Suspended'
      } catch (error) {
        // R2 has no object-versioning API. Other providers must explicitly confirm their state.
        const e = error as {
          name?: string
          $metadata?: { httpStatusCode?: number }
        }
        if (
          !/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(
            new URL(endpoint).hostname,
          ) ||
          !(e.name === 'NotImplemented' || e.$metadata?.httpStatusCode === 501)
        )
          throw error
      }
      const deadline = Date.now() + 15000
      async function removeBatch(
        entries: { Key: string; VersionId?: string }[],
      ) {
        for (const entry of entries)
          if (!entry.Key.startsWith(prefix))
            throw new Error('Invalid object scope')
        if (!entries.length) return
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: entries, Quiet: true },
          }),
        )
        if (result.Errors?.length)
          throw new Error('Object batch removal incomplete')
      }
      for (let page = 0; page < 4 && Date.now() < deadline; page++) {
        // Read the first remaining page after deletion, so retries cannot skip shifted keys.
        if (versioned) {
          const versions = await client.send(
            new ListObjectVersionsCommand({
              Bucket,
              Prefix: prefix,
              MaxKeys: 1000,
            }),
          )
          const entries = [
            ...(versions.Versions ?? []),
            ...(versions.DeleteMarkers ?? []),
          ].map((v) => {
            if (!v.Key?.startsWith(prefix) || !v.VersionId)
              throw new Error('Invalid version scope')
            return { Key: v.Key, VersionId: v.VersionId }
          })
          await removeBatch(entries)
          if (entries.length || versions.IsTruncated) continue
        }
        const uploads = await client.send(
          new ListMultipartUploadsCommand({
            Bucket,
            Prefix: prefix,
            MaxUploads: 10,
          }),
        )
        for (const upload of uploads.Uploads ?? []) {
          if (!upload.Key?.startsWith(prefix) || !upload.UploadId)
            throw new Error('Invalid multipart scope')
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket,
              Key: upload.Key,
              UploadId: upload.UploadId,
            }),
          )
        }
        const objects = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 1000 }),
        )
        const entries = (objects.Contents ?? []).map((o) => {
          if (!o.Key?.startsWith(prefix))
            throw new Error('Invalid object scope')
          return { Key: o.Key }
        })
        await removeBatch(entries)
        if (
          !entries.length &&
          !objects.IsTruncated &&
          !uploads.Uploads?.length &&
          !uploads.IsTruncated
        )
          return true
      }
      return false
    },
    async remove(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: safeKey(key) }))
    },
    async put(key: string, body: Uint8Array, contentType: string) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: safeKey(key),
          Body: body,
          ContentType: contentType,
        }),
      )
    },
    async getProbe(key: string) {
      const result = await client.send(
        new GetObjectCommand({ Bucket, Key: safeKey(key) }),
      )
      const stream = result.Body?.transformToWebStream()
      if (!stream) return undefined
      const reader = stream.getReader(),
        bytes = new Uint8Array(4096)
      let size = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          if (size + next.value.length > bytes.length) {
            await reader.cancel()
            throw new Error('Storage probe too large')
          }
          bytes.set(next.value, size)
          size += next.value.length
        }
      } finally {
        reader.releaseLock()
      }
      return bytes.subarray(0, size)
    },
    /** Verify browser behavior without reading administrative bucket configuration. */
    async browserCors(origin: string, key: string) {
      const putUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket,
          Key: safeKey(key),
          ContentLength: 32,
          ContentType: 'application/octet-stream',
        }),
        { expiresIn: 60 },
      )
      const getUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket, Key: safeKey(key) }),
        { expiresIn: 60 },
      )
      const headUrl = await getSignedUrl(
        client,
        new HeadObjectCommand({ Bucket, Key: safeKey(key) }),
        { expiresIn: 60 },
      )
      const allowsOrigin = (r: Response) =>
        [origin, '*'].includes(
          r.headers.get('access-control-allow-origin') ?? '',
        )
      const values = (r: Response, h: string) =>
        (r.headers.get(h) ?? '').split(',').map((v) => v.trim().toLowerCase())
      for (const [method, url] of [
        ['PUT', putUrl],
        ['GET', getUrl],
        ['HEAD', headUrl],
      ] as const) {
        const response = await transport(url, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': method,
            ...(method === 'PUT'
              ? { 'Access-Control-Request-Headers': 'content-type' }
              : {}),
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        })
        try {
          if (
            !response.ok ||
            !allowsOrigin(response) ||
            !values(response, 'access-control-allow-methods').some(
              (v) => v === method.toLowerCase() || v === '*',
            )
          )
            return false
          if (
            method === 'PUT' &&
            !values(response, 'access-control-allow-headers').some(
              (v) => v === 'content-type' || v === '*',
            )
          )
            return false
        } finally {
          await response.body?.cancel().catch(() => undefined)
        }
      }
      const response = await transport(getUrl, {
        headers: { Origin: origin },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      })
      try {
        return (
          response.ok &&
          allowsOrigin(response) &&
          response.headers.has('etag') &&
          values(response, 'access-control-expose-headers').some(
            (v) => v === 'etag' || v === '*',
          )
        )
      } finally {
        await response.body?.cancel().catch(() => undefined)
      }
    },
    async cors(origin: string) {
      const r = await client.send(new GetBucketCorsCommand({ Bucket }))
      return (r.CORSRules ?? []).some(
        (rule) =>
          (rule.AllowedOrigins ?? []).includes(origin) &&
          ['GET', 'PUT', 'HEAD'].every((method) =>
            rule.AllowedMethods?.includes(method),
          ) &&
          (rule.ExposeHeaders ?? []).some((h) => h.toLowerCase() === 'etag') &&
          (rule.AllowedHeaders ?? []).some((h) =>
            ['*', 'content-type'].includes(h.toLowerCase()),
          ),
      )
    },
    async recoverMultipart(key: string) {
      const prefix = safeKey(key),
        ids = new Set<string>(),
        cursors = new Set<string>()
      let keyMarker: string | undefined, uploadIdMarker: string | undefined
      // Bound provider pagination, and never return a partial list for cleanup.
      for (let page = 0; page < 20; page++) {
        const result = await client.send(
          new ListMultipartUploadsCommand({
            Bucket,
            Prefix: prefix,
            MaxUploads: 100,
            EncodingType: 'url',
            KeyMarker: keyMarker,
            UploadIdMarker: uploadIdMarker,
          }),
        )
        // The SDK leaves S3 EncodingType=url values encoded. Decode exactly once;
        // decoding unlabelled keys would confuse literal percent-escaped names.
        const decodeKey = (value: string) =>
          result.EncodingType === 'url' ? decodeURIComponent(value) : value
        for (const upload of result.Uploads ?? []) {
          if (
            upload.Key !== undefined &&
            decodeKey(upload.Key) === key &&
            upload.UploadId
          )
            ids.add(upload.UploadId)
        }
        if (ids.size > 100)
          throw new Error('Too many multipart sessions for one object')
        if (!result.IsTruncated) return [...ids]
        if (result.NextKeyMarker === undefined)
          throw new Error('Missing multipart pagination marker')
        keyMarker = decodeKey(result.NextKeyMarker)
        uploadIdMarker = result.NextUploadIdMarker
        const cursor = JSON.stringify([keyMarker, uploadIdMarker])
        if (cursors.has(cursor))
          throw new Error('Repeated multipart pagination marker')
        cursors.add(cursor)
      }
      throw new Error('Multipart pagination limit exceeded')
    },
    async multipart(key: string, contentType: string) {
      const r = await client.send(
        new CreateMultipartUploadCommand({
          Bucket,
          Key: safeKey(key),
          ContentType: contentType,
        }),
      )
      if (!r.UploadId) throw new Error('Missing multipart identity')
      return r.UploadId
    },
    async signPart(
      key: string,
      uploadId: string,
      partNumber: number,
      bytes: number,
    ) {
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 10485760)
        throw new Error('Invalid upload part size')
      if (
        !Number.isSafeInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > 10000
      )
        throw new Error('Invalid part')
      return getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket,
          Key: safeKey(key),
          UploadId: uploadId,
          PartNumber: partNumber,
          ContentLength: bytes,
        }),
        { expiresIn: 300 },
      )
    },
    async parts(key: string, uploadId: string) {
      const r = await client.send(
        new ListPartsCommand({
          Bucket,
          Key: safeKey(key),
          UploadId: uploadId,
          MaxParts: 1000,
        }),
      )
      return (r.Parts ?? []).map((p) => ({
        partNumber: p.PartNumber!,
        etag: p.ETag!,
        bytes: p.Size!,
      }))
    },
    async finish(
      key: string,
      uploadId: string,
      parts: { partNumber: number; etag: string }[],
    ) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: safeKey(key),
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((p) => ({
              PartNumber: p.partNumber,
              ETag: p.etag,
            })),
          },
        }),
      )
    },
    async abort(key: string, uploadId: string) {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket,
          Key: safeKey(key),
          UploadId: uploadId,
        }),
      )
    },
  }
}
