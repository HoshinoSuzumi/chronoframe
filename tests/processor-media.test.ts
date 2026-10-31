import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { ExifTool } from 'exiftool-vendored'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { processWork } from '../apps/worker/src/process.ts'
import type { CloudLease } from '../packages/core/src/cloud-execution.ts'
const bmp = createRequire(
  new URL('../packages/media/src/processor.ts', import.meta.url),
)('@vingle/bmp-js')
const lease = {
  id: 'job',
  photoId: 'photo',
  siteId: 1,
  sourceVersion: 'v1',
  pipelineVersion: '1',
  attemptId: 'a',
  workerId: 'n',
  attempts: 1,
  connectionRevision: 1,
  connectionId: 's3',
  objectKey: 'source.jpg',
  expectedBytes: 0,
} satisfies CloudLease

test('Docker processing path persists actual GPS, creates thumbnails and physically erases location from downloads', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'processor-test-')),
    tool = new ExifTool({ maxProcs: 1 }),
    originalFetch = globalThis.fetch
  try {
    const file = path.join(dir, 'source.jpg')
    await writeFile(
      file,
      await sharp({
        create: { width: 32, height: 24, channels: 3, background: '#123456' },
      })
        .jpeg()
        .toBuffer(),
    )
    await tool.write(
      file,
      {
        GPSLatitude: 31.2,
        GPSLongitude: 121.5,
        GPSLatitudeRef: 'N',
        GPSLongitudeRef: 'E',
      },
      ['-overwrite_original'],
    )
    const input = await readFile(file)
    globalThis.fetch = async () => new Response(new Uint8Array(input))
    const item = {
      lease: { ...lease, expectedBytes: input.length },
      sourceUrl: 'https://storage.example/source',
      fileName: 'source.jpg',
      contentType: 'image/jpeg',
    }
    const result = await processWork(item, new AbortController().signal)
    assert.equal(result.result.metadata.latitude, 31.2)
    assert.equal(result.result.metadata.longitude, 121.5)
    assert(result.derivatives.some((d) => d.role === 'thumbnail'))
    const erased = await processWork(
      { ...item, eraseLocation: true },
      new AbortController().signal,
    )
    assert.equal(erased.result.metadata.latitude, null)
    assert.equal((erased.result.metadata.exif as any)?.GPSLatitude, undefined)
    const sanitized = erased.derivatives.find(
      (d) => d.role === 'sanitized-original',
    )
    assert(sanitized)
    const sanitizedFile = path.join(dir, 'erased.jpg')
    await writeFile(sanitizedFile, sanitized.buffer)
    assert.equal((await tool.read(sanitizedFile)).GPSLatitude, undefined)
  } finally {
    globalThis.fetch = originalFetch
    await tool.end()
    await rm(dir, { recursive: true, force: true })
  }
})
test('BMP passes the processing adapter instead of failing the Sharp preflight', async () => {
  const originalFetch = globalThis.fetch
  try {
    const input = bmp.encode({
      data: Buffer.alloc(4 * 4 * 4, 255),
      width: 4,
      height: 4,
    }).data
    globalThis.fetch = async () => new Response(new Uint8Array(input))
    const result = await processWork(
      {
        lease: { ...lease, expectedBytes: input.length },
        sourceUrl: 'https://storage.example/source',
        fileName: 'photo.bmp',
        contentType: 'image/bmp',
      },
      new AbortController().signal,
    )
    assert.equal(result.result.width, 4)
    assert.equal(result.result.height, 4)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('explicit MOV attachment overrides an embedded motion video and preserves edited metadata', async () => {
  const originalFetch = globalThis.fetch
  try {
    const jpeg = await sharp({
      create: { width: 16, height: 12, channels: 3, background: '#789abc' },
    })
      .jpeg()
      .toBuffer()
    const embedded = Buffer.alloc(9000)
    embedded.writeUInt32BE(24, 0)
    embedded.write('ftypisom', 4)
    const input = Buffer.concat([jpeg, embedded]),
      companion = Buffer.from('external-mov')
    globalThis.fetch = async (url) =>
      new Response(
        new Uint8Array(String(url).endsWith('/video') ? companion : input),
      )
    const result = await processWork(
      {
        lease: { ...lease, expectedBytes: input.length },
        sourceUrl: 'https://storage.example/source',
        fileName: 'source.jpg',
        contentType: 'image/jpeg',
        companion: {
          key: 'video.MOV',
          url: 'https://storage.example/video',
          bytes: companion.length,
        },
        options: { operation: 'live-photo', options_json: '{}' },
        priorMetadata: {
          title: 'Edited',
          metadata_json: JSON.stringify({
            description: 'Keep me',
            tags: ['edited'],
            dateTaken: '2020-01-01',
            exif: { Rating: 5 },
          }),
        },
      },
      new AbortController().signal,
    )
    const videos = result.derivatives.filter((d) => d.role === 'live-video')
    assert.equal(videos.length, 1)
    assert.equal(videos[0]?.contentType, 'video/quicktime')
    assert.deepEqual(videos[0]?.buffer, companion)
    assert.equal(result.result.metadata.title, 'Edited')
    assert.equal((result.result.metadata.exif as any).Rating, 5)
  } finally {
    globalThis.fetch = originalFetch
  }
})
