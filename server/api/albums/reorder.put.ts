import z from 'zod'
import { requireAdminSession } from '../../utils/require-admin.ts'

export default eventHandler(async (event) => {
  await requireAdminSession(event)

  const { albumIds } = await readValidatedBody(
    event,
    z.object({
      albumIds: z.array(z.number().int()),
    }).parse,
  )

  const db = useDB()

  // Reassign position by incoming order (gap of 1000 to ease future inserts)
  db.transaction((tx) => {
    albumIds.forEach((id, index) => {
      tx.update(tables.albums)
        .set({ position: index * 1000 })
        .where(eq(tables.albums.id, id))
        .run()
    })
  })

  return { success: true }
})
