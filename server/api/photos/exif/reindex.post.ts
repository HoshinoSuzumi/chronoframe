import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { eq, isNotNull, inArray, and } from 'drizzle-orm'
import {
  extractExifData,
  extractPhotoInfo,
} from '~~/server/services/image/exif'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readBody(event)
  const { action, photoId } = body

  try {
    if (action === 'single-reindex' && photoId) {
      // 处理单个照片的 EXIF 重新索引
      const photo = await useDB()
        .select()
        .from(tables.photos)
        .where(
          siteAnd(
            eq(tables.photos.id, photoId),
            siteEq(tables.photos.siteId, DEFAULT_SITE.id),
          ),
        )
        .limit(1)
        .then((rows) => rows[0])

      if (!photo) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Photo not found',
        })
      }

      logger.chrono.info(`Reindexing EXIF for photo ${photoId}`)

      // 重新提取文件的元数据
      const { storageProvider } = useStorageProvider(event)
      const fileBuffer = await storageProvider.get(photo.storageKey!)

      if (!fileBuffer) {
        throw createError({
          statusCode: 404,
          statusMessage: 'File not found in storage',
        })
      }

      // 提取新的 EXIF 数据
      const exifData = await extractExifData(
        fileBuffer,
        undefined,
        logger.chrono,
      )
      const photoInfo = extractPhotoInfo(photo.storageKey!, exifData)

      // 更新数据库中的 EXIF 数据
      await useDB()
        .update(tables.photos)
        .set({
          exif: exifData,
          title: photoInfo.title,
          dateTaken: photoInfo.dateTaken,
          tags: photoInfo.tags,
          lastModified: new Date().toISOString(),
          thumbnailKey: `${storageProvider.config?.prefix?.replace(/\/$/, '')}/thumbnails/${photoId}.webp`,
        })
        .where(
          siteAnd(
            eq(tables.photos.id, photoId),
            siteEq(tables.photos.siteId, DEFAULT_SITE.id),
          ),
        )

      logger.chrono.success(`Successfully reindexed EXIF for photo ${photoId}`)

      return {
        success: true,
        message: 'EXIF 数据已成功重新索引',
        photoId,
      }
    } else if (action === 'batch-reindex') {
      // 批量重新索引所有照片的 EXIF
      const { photoIds } = body
      let photos

      if (photoIds && Array.isArray(photoIds) && photoIds.length > 0) {
        // 只处理指定的照片
        photos = await useDB()
          .select({
            id: tables.photos.id,
            storageKey: tables.photos.storageKey,
          })
          .from(tables.photos)
          .where(
            siteAnd(
              and(
                isNotNull(tables.photos.storageKey),
                inArray(tables.photos.id, photoIds),
              ),
              siteEq(tables.photos.siteId, DEFAULT_SITE.id),
            ),
          )
      } else {
        // 处理所有照片
        photos = await useDB()
          .select({
            id: tables.photos.id,
            storageKey: tables.photos.storageKey,
          })
          .from(tables.photos)
          .where(
            siteAnd(
              isNotNull(tables.photos.storageKey),
              siteEq(tables.photos.siteId, DEFAULT_SITE.id),
            ),
          )
      }

      if (photos.length === 0) {
        return {
          message: '没有找到需要重新索引的照片',
          results: {
            total: 0,
            processed: 0,
            updated: 0,
            errors: [],
          },
        }
      }

      logger.chrono.info(
        `Starting batch EXIF reindexing for ${photos.length} photos`,
      )

      let processed = 0
      let updated = 0
      const errors: Array<{ photoId: string; error: string }> = []
      const { storageProvider } = useStorageProvider(event)

      for (const photo of photos) {
        try {
          processed++

          logger.chrono.info(
            `Processing photo ${photo.id} (${processed}/${photos.length})`,
          )

          // 获取文件
          const fileBuffer = await storageProvider.get(photo.storageKey!)

          if (!fileBuffer) {
            errors.push({
              photoId: photo.id,
              error: 'File not found in storage',
            })
            continue
          }

          // 提取元数据和照片信息
          const exifData = await extractExifData(
            fileBuffer,
            undefined,
            logger.chrono,
          )
          const photoInfo = extractPhotoInfo(photo.storageKey!, exifData)

          // 更新数据库
          await useDB()
            .update(tables.photos)
            .set({
              exif: exifData,
              title: photoInfo.title,
              dateTaken: photoInfo.dateTaken,
              tags: photoInfo.tags,
              lastModified: new Date().toISOString(),
              thumbnailKey: `${storageProvider.config?.prefix?.replace(/\/$/, '')}/thumbnails/${photo.id}.webp`,
            })
            .where(
              siteAnd(
                eq(tables.photos.id, photo.id),
                siteEq(tables.photos.siteId, DEFAULT_SITE.id),
              ),
            )

          updated++

          logger.chrono.success(
            `Updated EXIF for photo ${photo.id} (${updated}/${processed})`,
          )

          // 添加小延迟以避免过度负载
          if (processed % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          logger.chrono.error(`Failed to process photo ${photo.id}:`, error)
          errors.push({
            photoId: photo.id,
            error: errorMessage,
          })
        }
      }

      const result = {
        message: `EXIF 重新索引完成`,
        results: {
          total: photos.length,
          processed,
          updated,
          errors: errors.length > 0 ? errors : undefined,
          statistics: {
            successRate:
              processed > 0
                ? (((processed - errors.length) / processed) * 100).toFixed(1) +
                  '%'
                : '0%',
          },
        },
      }

      logger.chrono.success(
        `EXIF batch reindexing completed: ${updated} photos updated out of ${processed} processed`,
      )

      return result
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid action parameter',
      })
    }
  } catch (error) {
    logger.chrono.error('Failed to reindex EXIF data:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reindex EXIF data',
    })
  }
})
