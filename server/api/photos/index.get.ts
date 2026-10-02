import { desc } from 'drizzle-orm'

export default eventHandler(async (_event) => {
  await requireUserSession(_event)
  return useDB()
    .select()
    .from(tables.photos)
    .orderBy(desc(tables.photos.dateTaken))
    .all()
})
