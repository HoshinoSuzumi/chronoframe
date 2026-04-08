import { sql, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const photoIds = query.ids

  if (!photoIds) {
    throw createError({
      statusCode: 400,
      message: 'Photo IDs are required',
    })
  }

  // 支持单个或多个 ID
  const ids = Array.isArray(photoIds) ? photoIds : [photoIds]

  if (ids.length === 0) {
    return {}
  }

  const db = useDB()

  // 获取所有照片的表态统计
  const reactions = db
    .select({
      photoId: tables.photoReactions.photoId,
      reactionType: tables.photoReactions.reactionType,
      count: sql<number>`count(*)`,
    })
    .from(tables.photoReactions)
    .where(inArray(tables.photoReactions.photoId, ids as string[]))
    .groupBy(tables.photoReactions.photoId, tables.photoReactions.reactionType)
    .all()

  const result: Record<string, Record<string, number>> = {}

  ids.forEach((id) => {
    result[id as string] = {
      like: 0,
      love: 0,
      amazing: 0,
      funny: 0,
      wow: 0,
      sad: 0,
      fire: 0,
      sparkle: 0,
    }
  })

  // 填充实际的计数
  reactions.forEach((r) => {
    if (r.photoId && r.reactionType) {
      result[r.photoId][r.reactionType] = r.count
    }
  })

  return result
})
