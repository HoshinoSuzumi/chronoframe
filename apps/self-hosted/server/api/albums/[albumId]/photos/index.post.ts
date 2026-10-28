import {
  createError,
  eventHandler,
  getValidatedRouterParams,
  readValidatedBody,
} from 'h3'
import { z } from 'zod'
import { MAX_ALBUM_PHOTOS_PER_REQUEST } from '#shared/utils/album'
import { addExistingPhotosToAlbum } from '../../../../utils/album-photos-add'
import { useDB } from '../../../../utils/db'
import { requireAdminSession } from '../../../../utils/require-admin.ts'

export default eventHandler(async (event) => {
  await requireAdminSession(event)

  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({ albumId: z.coerce.number().int().positive() }).parse,
  )
  const { photoIds } = await readValidatedBody(
    event,
    z.object({
      photoIds: z
        .array(z.string().min(1))
        .min(1)
        .max(MAX_ALBUM_PHOTOS_PER_REQUEST),
    }).parse,
  )

  const result = addExistingPhotosToAlbum(useDB(), albumId, photoIds)
  if ('error' in result) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Album not found',
    })
  }
  return result
})
