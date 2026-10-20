import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import {
  StorageManager,
  LocalStorageProvider,
  S3StorageProvider,
  OpenListStorageProvider,
} from '@chronoframe/storage'

test('Local provider reads, lists, streams and deletes through an isolated manager', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-storage-'))
  try {
    const manager = new StorageManager({
      provider: 'local',
      basePath: directory,
      prefix: 'photos',
      baseUrl: '/storage',
    })
    const provider = manager.getProvider<LocalStorageProvider>()
    const body = Buffer.from('image-body')
    const object = await provider.create('album/pic.jpg', body)
    assert.equal(object.key, 'photos/album/pic.jpg')
    assert.deepEqual(await provider.get(object.key), body)
    assert.equal((await provider.getFileMeta(object.key))?.size, body.length)
    assert.equal(
      provider.getPublicUrl(object.key),
      '/storage/photos/album/pic.jpg',
    )
    const source = path.join(directory, 'source.bin')
    await writeFile(source, body)
    await provider.createFromFile('copy.webp', source)
    assert.deepEqual((await provider.listImages()).map((o) => o.key).sort(), [
      'photos/album/pic.jpg',
      'photos/copy.webp',
    ])
    await provider.delete(object.key)
    assert.equal(await provider.get(object.key), null)
    assert.equal(await provider.getFileMeta(object.key), null)
    const events: string[] = []
    manager.on('provider-changed', (event) => {
      events.push(event.type)
    })
    await manager.registerProvider({
      provider: 'local',
      basePath: directory,
      prefix: 'other',
    })
    assert.deepEqual(events, ['provider-changed'])
    assert.equal(await manager.getProvider().get('copy.webp'), null)
    assert.deepEqual(
      await provider.get('copy.webp'),
      body,
      'existing instance retains its configuration',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('S3 exports sign browser direct uploads without Nuxt globals or a network call', async () => {
  const provider = new S3StorageProvider({
    provider: 's3',
    bucket: 'photos',
    region: 'auto',
    endpoint: 'https://s3.example.com',
    accessKeyId: 'fixture-key',
    secretAccessKey: 'fixture-secret',
    forcePathStyle: true,
  })
  const plan = await provider.prepareDirectUpload(
    'album/test.jpg',
    1024,
    'image/jpeg',
  )
  assert.equal(plan.mode, 'single')
  if (plan.mode !== 'single') throw new Error('Expected single upload')
  const url = new URL(plan.url)
  assert.equal(url.pathname, '/photos/album/test.jpg')
  assert.ok(url.searchParams.get('X-Amz-Signature'))
  assert.equal(
    provider.getPublicUrl('album/test.jpg'),
    'https://s3.example.com/photos/album/test.jpg',
  )
})

test('OpenList preserves its HTTP upload, metadata, download and delete protocol', async () => {
  let stored: Buffer | null = null
  const received: string[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const address = server.address() as { port: number }
    if (req.url === '/raw') {
      res.end(stored)
      return
    }
    assert.equal(req.headers.authorization, 'fixture-token')
    received.push(req.url || '')
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/fs/put') {
      assert.equal(
        decodeURIComponent(String(req.headers['file-path'])),
        '/photos/test.jpg',
      )
      stored = body
      res.end(JSON.stringify({ code: 200 }))
    } else if (req.url === '/api/fs/get') {
      assert.equal(JSON.parse(body.toString()).path, '/photos/test.jpg')
      res.end(
        JSON.stringify(
          stored
            ? {
                code: 200,
                data: {
                  size: stored.length,
                  modified: '2026-01-02T00:00:00Z',
                  raw_url: `http://127.0.0.1:${address.port}/raw`,
                },
              }
            : { code: 404 },
        ),
      )
    } else if (req.url === '/api/fs/remove') {
      assert.deepEqual(JSON.parse(body.toString()), {
        dir: '/photos',
        names: ['test.jpg'],
      })
      stored = null
      res.end(JSON.stringify({ code: 200 }))
    } else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address() as { port: number }
    const provider = new OpenListStorageProvider({
      provider: 'openlist',
      baseUrl: `http://127.0.0.1:${address.port}`,
      rootPath: '/photos',
      token: 'fixture-token',
    })
    const body = Buffer.from('fixture-image')
    const object = await provider.create('test.jpg', body, 'image/jpeg')
    assert.equal(object.key, 'photos/test.jpg')
    assert.equal(object.size, body.length)
    assert.deepEqual(await provider.get(object.key), body)
    await provider.delete(object.key)
    assert.equal(await provider.getFileMeta(object.key), null)
    assert.ok(received.includes('/api/fs/remove'))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test(
  'S3 SDK operations and multipart size/ETag validation survive package extraction',
  { timeout: 20000 },
  async () => {
    const objects = new Map<string, Buffer>()
    const parts = new Map<number, Buffer>()
    const etag = '"fixture-etag"'
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks)
        const key = url.pathname.replace('/photos/', '')
        res.setHeader('content-type', 'application/xml')
        if (req.method === 'POST' && url.searchParams.has('uploads')) {
          parts.clear()
          res.end(
            '<InitiateMultipartUploadResult><Bucket>photos</Bucket><Key>large.jpg</Key><UploadId>fixture-upload</UploadId></InitiateMultipartUploadResult>',
          )
        } else if (req.method === 'PUT' && url.searchParams.has('partNumber')) {
          parts.set(Number(url.searchParams.get('partNumber')), body)
          res.setHeader('etag', etag)
          res.end()
        } else if (req.method === 'GET' && url.searchParams.has('uploadId')) {
          res.end(
            `<ListPartsResult><IsTruncated>false</IsTruncated>${[...parts].map(([number, value]) => `<Part><PartNumber>${number}</PartNumber><ETag>&quot;fixture-etag&quot;</ETag><Size>${value.length}</Size></Part>`).join('')}</ListPartsResult>`,
          )
        } else if (req.method === 'POST' && url.searchParams.has('uploadId')) {
          objects.set(
            key,
            Buffer.concat(
              [...parts.entries()]
                .sort(([a], [b]) => a - b)
                .map(([, value]) => value),
            ),
          )
          res.end(
            '<CompleteMultipartUploadResult><Bucket>photos</Bucket><Key>large.jpg</Key><ETag>&quot;fixture-etag&quot;</ETag></CompleteMultipartUploadResult>',
          )
        } else if (req.method === 'GET' && url.pathname === '/photos/') {
          res.end(
            `<ListBucketResult><IsTruncated>false</IsTruncated>${[...objects].map(([name, value]) => `<Contents><Key>${name}</Key><Size>${value.length}</Size><ETag>&quot;fixture-etag&quot;</ETag></Contents>`).join('')}</ListBucketResult>`,
          )
        } else if (req.method === 'PUT') {
          objects.set(key, body)
          res.setHeader('etag', etag)
          res.end()
        } else if (req.method === 'DELETE') {
          objects.delete(key)
          res.statusCode = 204
          res.end()
        } else if (objects.has(key)) {
          const value = objects.get(key)!
          res.setHeader('content-length', value.length)
          res.setHeader('etag', etag)
          res.end(req.method === 'HEAD' ? undefined : value)
        } else {
          res.statusCode = 404
          res.end('<Error><Code>NoSuchKey</Code></Error>')
        }
      } catch {
        res.statusCode = 500
        res.end('Internal server error')
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const { port } = server.address() as { port: number }
      const provider = new S3StorageProvider({
        provider: 's3',
        bucket: 'photos',
        region: 'us-east-1',
        endpoint: `http://127.0.0.1:${port}`,
        accessKeyId: 'fixture-key',
        secretAccessKey: 'fixture-secret',
        forcePathStyle: true,
      })
      const image = Buffer.from('fixture-image')
      await provider.create('small.jpg', image, 'image/jpeg')
      assert.deepEqual(await provider.get('small.jpg'), image)
      assert.equal(
        (await provider.getFileMeta('small.jpg'))?.size,
        image.length,
      )
      assert.ok(
        (await provider.listAll()).some((object) => object.key === 'small.jpg'),
      )
      const prefixed = new S3StorageProvider({
        ...provider.config,
        prefix: '/library/',
      })
      const first = await prefixed.create('edit.jpg', image, 'image/jpeg')
      assert.equal(first.key, 'library/edit.jpg')
      const replacement = Buffer.from('updated-exif-fixture')
      assert.equal(
        (await prefixed.create(first.key, replacement, 'image/jpeg')).key,
        first.key,
      )
      assert.deepEqual(await prefixed.get(first.key), replacement)
      assert.equal(objects.has('library/library/edit.jpg'), false)
      const size = 8 * 1024 * 1024 + 5
      const plan = await provider.prepareDirectUpload(
        'large.jpg',
        size,
        'image/jpeg',
      )
      assert.equal(plan.mode, 'multipart')
      if (plan.mode !== 'multipart')
        throw new Error('Expected multipart upload')
      const uploadedParts = []
      for (const [index, url] of plan.partUrls.entries()) {
        const response = await fetch(url, {
          method: 'PUT',
          body: Buffer.alloc(
            Math.min(plan.partSize, size - index * plan.partSize),
            index + 1,
          ),
        })
        assert.equal(response.status, 200)
        uploadedParts.push({
          partNumber: index + 1,
          etag: response.headers.get('etag')!,
        })
      }
      await assert.rejects(
        plan.complete(
          uploadedParts.map((part) => ({ ...part, etag: 'wrong' })),
        ),
        /ETag mismatch/,
      )
      assert.equal(await provider.getFileMeta('large.jpg'), null)
      for (const invalidParts of [
        [],
        uploadedParts.slice(0, 1),
        [uploadedParts[0]!, uploadedParts[0]!],
        [...uploadedParts, uploadedParts[0]!],
        uploadedParts.map((part) => ({ ...part, partNumber: 0 })),
      ]) {
        await assert.rejects(plan.complete(invalidParts), /ETag mismatch/)
        assert.equal(await provider.getFileMeta('large.jpg'), null)
      }
      await plan.complete(uploadedParts)
      assert.equal((await provider.getFileMeta('large.jpg'))?.size, size)
      await provider.delete('small.jpg')
      assert.equal(await provider.get('small.jpg'), null)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
)

test('Local URL slash trimming handles long edge runs', () => {
  const slashes = '/'.repeat(100_000)
  const provider = new LocalStorageProvider({
    provider: 'local',
    basePath: '/tmp',
    prefix: `${slashes}photos${slashes}`,
    baseUrl: `https://media.example.com${slashes}`,
  })
  assert.equal(
    provider.getPublicUrl('pic.jpg'),
    'https://media.example.com/photos/pic.jpg',
  )
})

test('S3 public URL routing matches endpoint hostnames rather than URL substrings', () => {
  for (const [endpoint, expected] of [
    [
      'https://s3.us-east-1.amazonaws.com',
      'https://photos.s3.us-east-1.amazonaws.com/pic.jpg',
    ],
    [
      'https://oss-cn-hangzhou.aliyuncs.com',
      'https://photos.oss-cn-hangzhou.aliyuncs.com/pic.jpg',
    ],
    [
      'https://amazonaws.com.attacker.example',
      'https://amazonaws.com.attacker.example/photos/pic.jpg',
    ],
    [
      'https://aliyuncs.com.attacker.example',
      'https://aliyuncs.com.attacker.example/photos/pic.jpg',
    ],
    ['https://notamazonaws.com', 'https://notamazonaws.com/photos/pic.jpg'],
    [
      'https://storage.example/amazonaws.com',
      'https://storage.example/amazonaws.com/photos/pic.jpg',
    ],
    [
      'https://storage.example/aliyuncs.com',
      'https://storage.example/aliyuncs.com/photos/pic.jpg',
    ],
  ]) {
    const provider = new S3StorageProvider({
      provider: 's3',
      bucket: 'photos',
      region: 'us-east-1',
      endpoint,
      accessKeyId: 'fixture-key',
      secretAccessKey: 'fixture-secret',
    })
    assert.equal(provider.getPublicUrl('pic.jpg'), expected)
  }
})
