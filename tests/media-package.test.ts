import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { ExifTool } from 'exiftool-vendored'
import { createImageProcessor } from '@chronoframe/media/processor'
import { createExifService } from '@chronoframe/media/exif'
import { generateThumbnailAndHash } from '@chronoframe/media/thumbnail'
import { calculateHistogramFromBuffer } from '@chronoframe/media/histogram'
import { processMotionPhotoFromXmp } from '@chronoframe/media/motion-photo'
import { LocalStorageProvider } from '@chronoframe/storage'

const logger = { info() {}, warn() {}, error() {}, success() {}, debug() {} }

test('media runs outside Nuxt: orientation, thumbnail, hash and histogram', async () => {
  const image = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#ff0000' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const processor = createImageProcessor(logger)
  const result = await processor.processImageMetadataAndSharp(
    image,
    'portrait.jpg',
  )
  assert.ok(result)
  assert.equal(result.metadata.width, 800)
  assert.equal(result.metadata.height, 1200)
  const { thumbnailBuffer, thumbnailHash } = await generateThumbnailAndHash(
    image,
    logger,
  )
  const thumbnail = await sharp(thumbnailBuffer).metadata()
  assert.equal(thumbnail.format, 'webp')
  assert.equal(thumbnail.width, 600)
  assert.equal(thumbnail.height, 900)
  assert.ok(thumbnailHash?.length)
  const histogram = await calculateHistogramFromBuffer(image, logger)
  assert.equal(histogram.r.length, 256)
  assert.ok(Math.abs(histogram.r.reduce((a, b) => a + b, 0) - 1) < 1e-8)
})

test('ExifTool extraction receives an explicit work directory and cleans temporary files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-exif-'))
  const tool = new ExifTool({ maxProcs: 1 })
  try {
    const service = createExifService({
      exiftool: tool,
      tempDir: directory,
      logger,
    })
    const image = await sharp({
      create: { width: 16, height: 12, channels: 3, background: '#112233' },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'ChronoFrame', Model: 'Test Camera' } })
      .toBuffer()
    const exif = await service.extractExifData(image, undefined, logger)
    assert.ok(exif)
    assert.equal(exif.Make, 'ChronoFrame')
    assert.deepEqual(await readdir(directory), [])
    assert.equal(
      service.extractPhotoInfo('album/2025-04-03.jpeg', exif).dateTaken,
      '2025-04-03T00:00:00.000Z',
    )
  } finally {
    await tool.end()
    await rm(directory, { recursive: true, force: true })
  }
})

test('motion photo extracts an embedded MP4 to an injected storage provider', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chronoframe-motion-'))
  try {
    const storage = new LocalStorageProvider({
      provider: 'local',
      basePath: directory,
    })
    const video = Buffer.alloc(9000)
    video.writeUInt32BE(24, 0)
    video.write('ftypisom', 4)
    const xmp = Buffer.from(
      `<x:xmpmeta><rdf:Description GCamera:MicroVideo="1" GCamera:MicroVideoOffset="${video.length}" /></x:xmpmeta>`,
    )
    const result = await processMotionPhotoFromXmp({
      photoId: 'motion-1',
      storageKey: 'motion.jpg',
      rawImageBuffer: Buffer.concat([xmp, video]),
      storageProvider: storage,
      logger,
    })
    assert.equal(result.isMotionPhoto, true)
    assert.ok(result.livePhotoVideoKey)
    assert.deepEqual(await storage.get(result.livePhotoVideoKey!), video)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test(
  'HEIC conversion produces a readable JPEG outside Nuxt',
  { skip: !process.env.CHRONOFRAME_HEIC_FIXTURE },
  async () => {
    const input = await readFile(process.env.CHRONOFRAME_HEIC_FIXTURE!)
    const processor = createImageProcessor(logger)
    const jpeg = await processor.preprocessImageBuffer(input, 'sample.heic')
    const result = await sharp(jpeg).metadata()
    assert.equal(result.format, 'jpeg')
    assert.ok(result.width && result.width > 0)
    assert.ok(result.height && result.height > 0)
  },
)

test('media input limits and cancellation are explicit and leave defaults unchanged', async () => {
  const buffer = Buffer.alloc(16)
  await assert.rejects(
    createImageProcessor(logger, { maxInputBytes: 8 }).preprocessImageBuffer(
      buffer,
      'input.jpg',
    ),
    /byte limit/,
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    createImageProcessor(logger, {
      signal: controller.signal,
    }).preprocessImageBuffer(buffer, 'input.jpg'),
    { name: 'AbortError' },
  )
  assert.equal(
    await createImageProcessor(logger).preprocessImageBuffer(
      buffer,
      'input.jpg',
    ),
    buffer,
  )
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#999999' },
  })
    .greyscale()
    .png()
    .toBuffer()
  const histogram = await calculateHistogramFromBuffer(image)
  for (const channel of Object.values(histogram)) {
    assert.ok(channel.every(Number.isFinite))
    assert.ok(
      Math.abs(channel.reduce((sum, value) => sum + value, 0) - 1) < 1e-8,
    )
  }
})
