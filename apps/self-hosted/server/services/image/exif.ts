import path from 'node:path'
import { exiftool } from 'exiftool-vendored'
import { logger } from '../../utils/logger'
import { createExifService } from '@chronoframe/media/exif'
export const { extractExifData, extractPhotoInfo } = createExifService({
  exiftool,
  tempDir: path.resolve(process.cwd(), 'data/.exif_workdir'),
  logger: logger.image,
})
