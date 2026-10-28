import { requireAdminSession } from '../../../utils/require-admin.ts'
import { ALBUM_SLUG_MAX_LENGTH } from '@chronoframe/contracts/album-slug'
import { z } from 'zod'
import {
  ALBUM_PASSWORD_MAX_LENGTH,
  ALBUM_PASSWORD_MIN_LENGTH,
} from '#shared/utils/album'
import {
  useAlbumWriter,
  mutationResponse,
} from '../../../utils/resource-writer'

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

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255).optional(),
      slug: z.string().trim().max(ALBUM_SLUG_MAX_LENGTH).optional(),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
      isHidden: z.boolean().optional(),
      password: z
        .union([
          z.literal(''),
          z
            .string()
            .min(ALBUM_PASSWORD_MIN_LENGTH)
            .max(ALBUM_PASSWORD_MAX_LENGTH),
        ])
        .optional(),
    }).parse,
  )

  return mutationResponse(() =>
    useAlbumWriter().update(albumId, body, { authenticated: true }),
  )
})
