import { requireAdminSession } from '../../../../utils/require-admin.ts'
import { z } from 'zod'
import {
  useAlbumWriter,
  mutationResponse,
} from '../../../../utils/resource-writer'

export default eventHandler(async (event) => {
  await requireAdminSession(event)
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    }).parse,
  )

  const { photoId } = await getValidatedRouterParams(
    event,
    z.object({
      photoId: z.string(),
    }).parse,
  )

  return mutationResponse(() =>
    useAlbumWriter().removePhoto(albumId, photoId, { authenticated: true }),
  )
})
