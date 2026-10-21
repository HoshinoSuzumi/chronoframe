import z from 'zod'
import { albumAccess } from '../../../utils/album-access'
import {
  resourceReadResponse,
  useResourceReader,
} from '../../../utils/resource-reader'

export default eventHandler(async (event) => {
  const { albumId } = await getValidatedRouterParams(
    event,
    z.object({
      albumId: z
        .string()
        .regex(/^\d+$/)
        .transform((value) => parseInt(value, 10)),
    }).parse,
  )
  const access = await albumAccess(event)
  return resourceReadResponse(() =>
    useResourceReader().getAlbum(albumId, access),
  )
})
