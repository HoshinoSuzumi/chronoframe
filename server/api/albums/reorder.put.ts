import { requireAdminSession } from '../../utils/require-admin.ts'
import { z } from 'zod'
import { useAlbumWriter, mutationResponse } from '../../utils/resource-writer'

export default eventHandler(async (event) => {
  await requireAdminSession(event)
  const { albumIds } = await readValidatedBody(
    event,
    z.object({
      albumIds: z.array(z.number().int()),
    }).parse,
  )

  return mutationResponse(() =>
    useAlbumWriter().reorder(albumIds, { authenticated: true }),
  )
})
