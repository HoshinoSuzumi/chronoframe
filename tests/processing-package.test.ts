import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createPhotoProcessor } from '@chronoframe/processing'
import { LocalStorageProvider } from '@chronoframe/storage'
import { validatePhotoPublication } from '@chronoframe/core'

const logger = { info() {}, warn() {}, error() {}, debug() {}, success() {} }
const exif = {
  extractExifData: async () => null,
  extractPhotoInfo: () => ({
    title: 'fixture',
    description: '',
    dateTaken: '2026-10-20',
    tags: [],
  }),
}

for (const format of ['jpeg', 'heic'] as const)
  test(
    `processing composes actual ${format} decoding, metadata, thumbnails and publication ownership`,
    { skip: format === 'heic' && !process.env.CHRONOFRAME_HEIC_FIXTURE },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'chronoframe-processing-'))
      try {
        const storage = new LocalStorageProvider({
          provider: 'local',
          basePath: root,
          baseUrl: '/storage',
          prefix: 'library',
        })
        const key = `library/fixture.${format}`
        const input =
          format === 'heic'
            ? await readFile(process.env.CHRONOFRAME_HEIC_FIXTURE!)
            : await sharp({
                create: {
                  width: 320,
                  height: 240,
                  channels: 3,
                  background: '#5799aa',
                },
              })
                .jpeg()
                .toBuffer()
        await storage.create(key, input)
        const stages: string[] = []
        const processor = createPhotoProcessor({
          logger,
          exif,
          parseGPS: () => ({}),
          reverseGeocode: async () => null,
        })
        const result = await processor({
          photoId: 'fixture',
          storageKey: key,
          eraseLocation: false,
          storage,
          stage: async (stage) => {
            stages.push(stage)
          },
        })
        assert.equal(
          result.sourceHash,
          createHash('sha256').update(input).digest('hex'),
        )
        assert.ok(result.photo.width! > 0 && result.photo.height! > 0)
        assert.equal(
          (
            await sharp(
              (await storage.get(result.photo.thumbnailKey!))!,
            ).metadata()
          ).format,
          'webp',
        )
        if (format === 'heic') {
          assert.ok(result.photo.originalDerivedKey)
          assert.equal(
            (
              await sharp(
                (await storage.get(result.photo.originalDerivedKey!))!,
              ).metadata()
            ).format,
            'jpeg',
          )
        }
        assert.deepEqual(stages, [
          'preprocessing',
          'metadata',
          'thumbnail',
          'exif',
          'reverse-geocoding',
          'motion-photo',
          'live-photo',
        ])
        const expected = {
          resourceId: 'fixture',
          sourceKey: key,
          generatedKeys: new Set([
            result.photo.thumbnailKey!,
            ...(result.photo.originalDerivedKey
              ? [result.photo.originalDerivedKey]
              : []),
          ]),
          linkedVideoKeys: new Set<string>(),
          publicUrl: (objectKey: string) => storage.getPublicUrl(objectKey),
        }
        validatePhotoPublication(result.photo, expected)
        for (const invalid of [
          { ...result.photo, id: 'other-site' },
          { ...result.photo, thumbnailKey: 'foreign.webp' },
          { ...result.photo, fileSize: NaN },
          { ...result.photo, originalUrl: 'https://foreign.invalid/photo' },
        ])
          assert.throws(() => validatePhotoPublication(invalid, expected))
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )
