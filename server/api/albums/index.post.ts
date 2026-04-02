import z from 'zod'
import { execMutation, getOne } from '~~/server/utils/db-query'
import { withDBTransaction } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readValidatedBody(
    event,
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      coverPhotoId: z.string().optional(),
      photoIds: z.array(z.string()).optional(),
    }).parse,
  )

  const album = await withDBTransaction(async (tx) => {
    const newAlbum = await getOne(
      tx
        .insert(tables.albums)
        .values({
          title: body.title,
          description: body.description || null,
          coverPhotoId: body.coverPhotoId || null,
        })
        .returning(),
    )
    if (!newAlbum) {
      throw new Error('Failed to create album')
    }

    const albumId = newAlbum.id
    const photoIds = new Set(body.photoIds || [])

    if (body.coverPhotoId) {
      photoIds.add(body.coverPhotoId)
    }

    if (photoIds.size > 0) {
      let pos = 1000000
      for (const photoId of photoIds) {
        await execMutation(
          tx
            .insert(tables.albumPhotos)
            .values({
              albumId,
              photoId,
              position: (pos += 10),
            })
            .onConflictDoNothing(),
        )
      }
    }

    return newAlbum
  })

  return album
})
