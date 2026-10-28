import { z } from 'zod'
import { hasValidCoordinates } from '#shared/utils/location'
import {
  usePhotoWriter,
  mutationResponse,
} from '../../../utils/resource-writer'

const paramsSchema = z.object({
  photoId: z.string().min(1),
})

const bodySchema = z.object({
  title: z.string().trim().max(512).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().max(128)).max(64).optional(),
  location: z
    .union([
      z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        })
        .refine(
          ({ latitude, longitude }) => hasValidCoordinates(latitude, longitude),
          {
            message: 'Coordinates (0, 0) are a missing-GPS placeholder',
          },
        ),
      z.null(),
    ])
    .optional(),
  rating: z.union([z.number().int().min(0).max(5), z.null()]).optional(),
})

export default eventHandler(async (event) => {
  await requireUserSession(event)
  const t = await useTranslation(event)
  const { photoId } = paramsSchema.parse(event.context.params ?? {})
  const payload = bodySchema.parse(await readBody(event))
  return mutationResponse(
    () =>
      usePhotoWriter(event).update(photoId, payload, { authenticated: true }),
    (key) => t(key),
  )
})
