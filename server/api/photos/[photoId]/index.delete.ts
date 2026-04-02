const HEIC_EXTENSIONS = ['.heic', '.heif', '.hif']
import { execMutation, getOne } from '~~/server/utils/db-query'

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const { storageProvider } = useStorageProvider(event)
  const photoId = getRouterParam(event, 'photoId')

  if (!photoId) {
    return createError({
      statusCode: 400,
      statusMessage: 'Photo ID is required',
    })
  }

  const photo = await getOne(
    useDB().select().from(tables.photos).where(eq(tables.photos.id, photoId)),
  )

  if (!photo) {
    return createError({
      statusCode: 404,
      statusMessage: 'Photo not found',
    })
  }

  logger.image.info(`Deleting photo ${photo.title || photo.id || photoId}`)

  if (photo.storageKey) {
    logger.image.info(`Deleting photo files for ${photoId} from storage`)
    try {
      await storageProvider.delete(photo.storageKey)
      const lowerStorageKey = photo.storageKey.toLowerCase()
      const heicExtension = HEIC_EXTENSIONS.find((ext) =>
        lowerStorageKey.endsWith(ext),
      )
      if (heicExtension) {
        const jpegKey =
          photo.storageKey.slice(
            0,
            photo.storageKey.length - heicExtension.length,
          ) + '.jpeg'

        if (jpegKey !== photo.storageKey) {
          logger.image.info(
            `Deleting converted JPEG for HEIC photo ${photoId}: ${jpegKey}`,
          )
          try {
            await storageProvider.delete(jpegKey)
          } catch {
            // ignore error when deleting converted JPEG
          }
        }
      }
      if (photo.thumbnailKey) {
        await storageProvider.delete(photo.thumbnailKey)
      }
      if (photo.livePhotoVideoKey) {
        await storageProvider.delete(photo.livePhotoVideoKey)
      }
    } catch {
      // ignore error
    }
  }

  await execMutation(
    useDB().delete(tables.photos).where(eq(tables.photos.id, photoId)),
  )

  logger.image.success(`Photo ${photoId} deleted`)

  return {
    statusCode: 200,
    statusMessage: 'Photo deleted successfully',
  }
})
