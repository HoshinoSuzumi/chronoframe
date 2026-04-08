import type { H3Event } from 'h3'
import { eq, and, sql } from 'drizzle-orm'

const REACTION_TYPES = [
  'like',
  'love',
  'amazing',
  'funny',
  'wow',
  'sad',
  'fire',
  'sparkle',
] as const
const RATE_LIMIT_WINDOW = 60 * 1000 // 1分钟
const MAX_REACTIONS_PER_WINDOW = 10 // 每分钟最多10次表态

// 客户端指纹
function generateFingerprint(event: H3Event): string {
  const headers = getHeaders(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const userAgent = headers['user-agent'] || 'unknown'
  const acceptLanguage = headers['accept-language'] || 'unknown'
  const acceptEncoding = headers['accept-encoding'] || 'unknown'

  // 组合多个特征
  const fingerprint = `${ip}|${userAgent}|${acceptLanguage}|${acceptEncoding}`

  // 使用简单的哈希
  return Buffer.from(fingerprint).toString('base64')
}

// 检查速率限制
async function checkRateLimit(fingerprint: string): Promise<boolean> {
  const db = useDB()
  const now = Date.now()
  const windowStart = new Date(now - RATE_LIMIT_WINDOW)

  const recentReactions = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.photoReactions)
    .where(
      and(
        eq(tables.photoReactions.fingerprint, fingerprint),
        sql`${tables.photoReactions.createdAt} > ${Math.floor(windowStart.getTime() / 1000)}`,
      ),
    )
    .get()

  return (recentReactions?.count || 0) < MAX_REACTIONS_PER_WINDOW
}

export default defineEventHandler(async (event) => {
  const photoId = getRouterParam(event, 'photoId')

  if (!photoId) {
    throw createError({
      statusCode: 400,
      message: 'Photo ID is required',
    })
  }

  const db = useDB()
  const method = event.method

  // GET: 获取照片的表态统计
  if (method === 'GET') {
    const reactions = await db
      .select({
        reactionType: tables.photoReactions.reactionType,
        count: sql<number>`count(*)`,
      })
      .from(tables.photoReactions)
      .where(eq(tables.photoReactions.photoId, photoId))
      .groupBy(tables.photoReactions.reactionType)
      .all()

    // 获取当前用户的表态
    const fingerprint = generateFingerprint(event)
    const userReaction = await db
      .select()
      .from(tables.photoReactions)
      .where(
        and(
          eq(tables.photoReactions.photoId, photoId),
          eq(tables.photoReactions.fingerprint, fingerprint),
        ),
      )
      .get()

    // 格式化返回数据
    const reactionCounts: Record<string, number> = {}
    for (const type of REACTION_TYPES) {
      reactionCounts[type] = 0
    }

    reactions.forEach((r) => {
      if (r.reactionType) {
        reactionCounts[r.reactionType] = r.count
      }
    })

    return {
      photoId,
      reactions: reactionCounts,
      userReaction: userReaction?.reactionType || null,
    }
  }

  // POST: 添加或更新表态
  if (method === 'POST') {
    const body = await readBody(event)
    const { reactionType } = body

    if (!reactionType || !REACTION_TYPES.includes(reactionType)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid reaction type',
      })
    }

    const fingerprint = generateFingerprint(event)

    // 检查速率限制
    const canReact = await checkRateLimit(fingerprint)
    if (!canReact) {
      throw createError({
        statusCode: 429,
        message: 'Too many reactions. Please try again later.',
      })
    }

    // 检查照片是否存在
    const photo = await db
      .select()
      .from(tables.photos)
      .where(eq(tables.photos.id, photoId))
      .get()

    if (!photo) {
      throw createError({
        statusCode: 404,
        message: 'Photo not found',
      })
    }

    // 获取额外信息用于审计
    const headers = getHeaders(event)
    const ipAddress = getRequestIP(event, { xForwardedFor: true })
    const userAgent = headers['user-agent']

    // 检查用户是否已经对该照片表态
    const existingReaction = await db
      .select()
      .from(tables.photoReactions)
      .where(
        and(
          eq(tables.photoReactions.photoId, photoId),
          eq(tables.photoReactions.fingerprint, fingerprint),
        ),
      )
      .get()

    if (existingReaction) {
      // 更新现有表态
      await db
        .update(tables.photoReactions)
        .set({
          reactionType,
          updatedAt: new Date(),
        })
        .where(eq(tables.photoReactions.id, existingReaction.id))

      return {
        success: true,
        action: 'updated',
        reactionType,
      }
    } else {
      // 创建新表态
      await db.insert(tables.photoReactions).values({
        photoId,
        reactionType,
        fingerprint,
        ipAddress,
        userAgent,
      })

      return {
        success: true,
        action: 'created',
        reactionType,
      }
    }
  }

  // DELETE: 删除表态
  if (method === 'DELETE') {
    const fingerprint = generateFingerprint(event)

    const existingReaction = await db
      .select()
      .from(tables.photoReactions)
      .where(
        and(
          eq(tables.photoReactions.photoId, photoId),
          eq(tables.photoReactions.fingerprint, fingerprint),
        ),
      )
      .get()

    if (!existingReaction) {
      throw createError({
        statusCode: 404,
        message: 'Reaction not found',
      })
    }

    await db
      .delete(tables.photoReactions)
      .where(eq(tables.photoReactions.id, existingReaction.id))

    return {
      success: true,
      action: 'deleted',
    }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed',
  })
})
