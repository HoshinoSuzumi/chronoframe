import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

/**
 * 重试指定的失败任务
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  try {
    const { taskId } = await readValidatedBody(
      event,
      z.object({
        taskId: z.number().int().positive(),
      }).parse,
    )

    const db = useDB()

    // 检查任务是否存在且状态为失败
    const task = await db
      .select()
      .from(tables.pipelineQueue)
      .where(
        siteAnd(
          eq(tables.pipelineQueue.id, taskId),
          siteEq(tables.pipelineQueue.siteId, DEFAULT_SITE.id),
        ),
      )
      .get()

    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found',
      })
    }

    if (task.payload.type === 'location-migration' && !session.user.isAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Admin privileges required',
      })
    }

    if (task.status !== 'failed') {
      throw createError({
        statusCode: 400,
        statusMessage: `Task is not in failed status, current status: ${task.status}`,
      })
    }

    // 重置任务状态为 pending，清除错误信息和状态阶段
    await db
      .update(tables.pipelineQueue)
      .set({
        status: 'pending',
        resourceId: null,
        sourceHash: null,
        attemptId: null,
        workerId: null,
        leaseExpiresAt: null,
        statusStage: null,
        errorMessage: null,
        warningCode: null,
        attempts: 0, // 重置尝试次数
        availableAt: new Date(),
      })
      .where(
        siteAnd(
          eq(tables.pipelineQueue.id, taskId),
          siteEq(tables.pipelineQueue.siteId, DEFAULT_SITE.id),
        ),
      )

    return {
      success: true,
      message: `Task ${taskId} has been reset and will be retried`,
      taskId,
      payload: task.payload,
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Failed to retry task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to retry task',
    })
  }
})
