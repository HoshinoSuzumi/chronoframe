import { sql, inArray } from 'drizzle-orm'
import { filterAccessiblePhotoIds } from '../../utils/album-access'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const photoIds = query.ids

  if (!photoIds) {
    throw createError({
      statusCode: 400,
      message: 'Photo IDs are required',
    })
  }

  // 支持单个或多个 ID。不可见的照片与不存在的 ID 一样不出现在结果里。
  const requestedIds = (Array.isArray(photoIds) ? photoIds : [photoIds]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  const accessibleIds = [
    ...(await filterAccessiblePhotoIds(event, requestedIds)),
  ]

  if (accessibleIds.length === 0) {
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
    .where(inArray(tables.photoReactions.photoId, accessibleIds))
    .groupBy(tables.photoReactions.photoId, tables.photoReactions.reactionType)
    .all()

  const result: Record<string, Record<string, number>> = {}

  for (const id of accessibleIds) {
    result[id] = {
      like: 0,
      love: 0,
      amazing: 0,
      funny: 0,
      wow: 0,
      sad: 0,
      fire: 0,
      sparkle: 0,
    }
  }

  for (const reaction of reactions) {
    if (!reaction.photoId || !reaction.reactionType) continue
    const counts = result[reaction.photoId]
    if (!counts) continue
    counts[reaction.reactionType] = reaction.count
  }

  return result
})
