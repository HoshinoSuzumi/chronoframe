import { desc } from 'drizzle-orm'
import { getAll } from '~~/server/utils/db-query'

export default eventHandler(async (_event) => {
  return getAll(
    useDB().select().from(tables.photos).orderBy(desc(tables.photos.dateTaken)),
  )
})
