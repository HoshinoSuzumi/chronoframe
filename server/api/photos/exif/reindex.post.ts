import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { CoreError, DEFAULT_SITE } from '@chronoframe/core'
import { createSiteRepository } from '@chronoframe/database'
import { extractExifData, extractPhotoInfo } from '../../../services/image/exif'
import { storageForPhoto } from '../../../utils/object-storage'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const { action, photoId, photoIds } = await readBody(event)
  const db = useDB(),
    repository = createSiteRepository(db, DEFAULT_SITE)
  const reindex = async (id: string) => {
    const { storageProvider: fallback } = useStorageProvider(event)
    const snapshot = await repository.capturePhoto(id)
    if (!snapshot?.photo.storageKey) throw new CoreError(404, 'Photo not found')
    const provider = await storageForPhoto(id, fallback)
    const buffer = await provider.get(snapshot.photo.storageKey)
    if (!buffer) throw new CoreError(404, 'File not found in storage')
    const exif = await extractExifData(buffer, undefined, logger.chrono)
    const info = extractPhotoInfo(snapshot.photo.storageKey, exif)
    await repository.updatePhotoSnapshot(id, snapshot.version, {
      exif,
      title: info.title,
      dateTaken: info.dateTaken,
      tags: info.tags,
      lastModified: new Date().toISOString(),
    })
  }
  try {
    if (action === 'single-reindex' && photoId) {
      await reindex(photoId)
      return { success: true, message: 'EXIF 数据已成功重新索引', photoId }
    }
    if (action !== 'batch-reindex')
      throw new CoreError(400, 'Invalid action parameter')
    const photos = db
      .select({ id: tables.photos.id })
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.siteId, DEFAULT_SITE.id),
          isNotNull(tables.photos.storageKey),
          Array.isArray(photoIds) && photoIds.length
            ? inArray(tables.photos.id, photoIds)
            : undefined,
        ),
      )
      .all()
    if (!photos.length)
      return {
        message: '没有找到需要重新索引的照片',
        results: { total: 0, processed: 0, updated: 0, errors: [] },
      }
    let processed = 0,
      updated = 0
    const errors: Array<{ photoId: string; error: string }> = []
    for (const photo of photos) {
      processed++
      try {
        await reindex(photo.id)
        updated++
      } catch (error) {
        errors.push({
          photoId: photo.id,
          error:
            error instanceof CoreError
              ? error.message
              : 'Failed to reindex photo',
        })
      }
      if (processed % 10 === 0)
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return {
      message: 'EXIF 重新索引完成',
      results: {
        total: photos.length,
        processed,
        updated,
        errors: errors.length ? errors : undefined,
        statistics: {
          successRate: processed
            ? (((processed - errors.length) / processed) * 100).toFixed(1) + '%'
            : '0%',
        },
      },
    }
  } catch (error) {
    if (error instanceof CoreError)
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
      })
    logger.chrono.error('Failed to reindex EXIF data', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reindex EXIF data',
    })
  }
})
