import { z } from 'zod'
import { or, eq, sql } from 'drizzle-orm'

/**
 * 清理非进行中的任务（已完成和失败的任务）
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const query = getQuery(event)
    const {
      includeCompleted = 'true',
      includeFailed = 'true',
      olderThanDays,
    } = await z
      .object({
        includeCompleted: z.string().optional().default('true'),
        includeFailed: z.string().optional().default('true'),
        olderThanDays: z.string().optional(),
      })
      .parseAsync(query)

    const shouldIncludeCompleted = includeCompleted === 'true'
    const shouldIncludeFailed = includeFailed === 'true'

    if (!shouldIncludeCompleted && !shouldIncludeFailed) {
      throw createError({
        statusCode: 400,
        statusMessage:
          'At least one of includeCompleted or includeFailed must be true',
      })
    }

    const db = useDB()

    // 构建状态条件
    const statusConditions = []
    if (shouldIncludeCompleted) {
      statusConditions.push(eq(tables.pipelineQueue.status, 'completed'))
    }
    if (shouldIncludeFailed) {
      statusConditions.push(eq(tables.pipelineQueue.status, 'failed'))
    }

    let whereCondition = or(...statusConditions)

    // 如果指定了时间范围，添加时间条件
    if (olderThanDays) {
      const daysThreshold = parseInt(olderThanDays)
      if (isNaN(daysThreshold) || daysThreshold < 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'olderThanDays must be a non-negative integer',
        })
      }

      const thresholdTimestamp = Math.floor(
        (Date.now() - daysThreshold * 24 * 60 * 60 * 1000) / 1000,
      )
      const timeCondition = sql`${tables.pipelineQueue.createdAt} < ${thresholdTimestamp}`

      whereCondition = sql`(${whereCondition}) AND ${timeCondition}`
    }

    // 首先查询要删除的任务以便返回统计信息
    const tasksToDelete = await db
      .select({
        id: tables.pipelineQueue.id,
        status: tables.pipelineQueue.status,
        payload: tables.pipelineQueue.payload,
        createdAt: tables.pipelineQueue.createdAt,
      })
      .from(tables.pipelineQueue)
      .where(whereCondition)

    if (tasksToDelete.length === 0) {
      return {
        success: true,
        message: 'No tasks found to clear',
        deletedCount: 0,
        breakdown: {
          completed: 0,
          failed: 0,
        },
      }
    }

    // 执行删除操作
    await db.delete(tables.pipelineQueue).where(whereCondition)

    // 统计删除的任务
    const breakdown = tasksToDelete.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    return {
      success: true,
      message: `Successfully cleared ${tasksToDelete.length} non-active tasks`,
      deletedCount: tasksToDelete.length,
      breakdown: {
        completed: breakdown.completed || 0,
        failed: breakdown.failed || 0,
      },
      ...(olderThanDays && {
        filter: {
          olderThanDays: parseInt(olderThanDays),
          thresholdDate: new Date(
            Date.now() - parseInt(olderThanDays) * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      }),
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Failed to clear tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to clear tasks',
    })
  }
})
