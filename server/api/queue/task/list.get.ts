import { z } from 'zod'
import { desc, sql, eq, and } from 'drizzle-orm'

/**
 * 获取所有队列任务记录列表
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const query = getQuery(event)
    const {
      status,
      type,
    } = await z
      .object({
        status: z.enum(['pending', 'in-stages', 'completed', 'failed']).optional(),
        type: z
          .enum(['photo', 'live-photo-video', 'photo-reverse-geocoding'])
          .optional(),
      })
      .parseAsync(query)

    const db = useDB()

    // 构建查询条件
    const conditions = []
    
    if (status) {
      conditions.push(eq(tables.pipelineQueue.status, status))
    }
    
    if (type) {
      conditions.push(eq(sql`json_extract(${tables.pipelineQueue.payload}, '$.type')`, type))
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined
    
    // 构建查询
    const queryBuilder = db
      .select({
        id: tables.pipelineQueue.id,
        payload: tables.pipelineQueue.payload,
        priority: tables.pipelineQueue.priority,
        attempts: tables.pipelineQueue.attempts,
        maxAttempts: tables.pipelineQueue.maxAttempts,
        status: tables.pipelineQueue.status,
        statusStage: tables.pipelineQueue.statusStage,
        errorMessage: tables.pipelineQueue.errorMessage,
        createdAt: tables.pipelineQueue.createdAt,
        completedAt: tables.pipelineQueue.completedAt,
      })
      .from(tables.pipelineQueue)
      .orderBy(desc(tables.pipelineQueue.createdAt))

    if (whereCondition) {
      queryBuilder.where(whereCondition)
    }

    const tasks = await queryBuilder

    return {
      success: true,
      data: tasks,
    }
  } catch (error) {
    console.error('Failed to fetch task list:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch task list',
    })
  }
})
