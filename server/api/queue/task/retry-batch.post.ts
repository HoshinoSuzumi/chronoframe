import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'

/**
 * 批量重试失败的任务
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const { taskIds, retryAll = false } = await readValidatedBody(
      event,
      z.object({
        taskIds: z.array(z.number().int().positive()).optional(),
        retryAll: z.boolean().optional().default(false),
      }).parse,
    )

    if (!retryAll && (!taskIds || taskIds.length === 0)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Either taskIds array or retryAll flag must be provided',
      })
    }

    const db = useDB()

    let whereCondition
    if (retryAll) {
      whereCondition = eq(tables.pipelineQueue.status, 'failed')
    } else {
      whereCondition = inArray(tables.pipelineQueue.id, taskIds!)
    }

    // 检查要重试的任务
    const tasksToRetry = await db
      .select()
      .from(tables.pipelineQueue)
      .where(whereCondition)

    const failedTasks = tasksToRetry.filter((task) => task.status === 'failed')

    if (failedTasks.length === 0) {
      return {
        success: true,
        message: 'No failed tasks found to retry',
        retriedCount: 0,
        skippedCount: retryAll ? 0 : taskIds?.length || 0,
      }
    }

    const nonFailedTasks = tasksToRetry.filter(
      (task) => task.status !== 'failed',
    )

    // 批量重置失败任务的状态
    const failedTaskIds = failedTasks.map((task) => task.id)

    await db
      .update(tables.pipelineQueue)
      .set({
        status: 'pending',
        statusStage: null,
        errorMessage: null,
        attempts: 0, // 重置尝试次数
        createdAt: new Date(), // 更新创建时间以便重新调度
      })
      .where(inArray(tables.pipelineQueue.id, failedTaskIds))

    return {
      success: true,
      message: `Successfully reset ${failedTasks.length} failed tasks for retry`,
      retriedCount: failedTasks.length,
      skippedCount: nonFailedTasks.length,
      retriedTasks: failedTasks.map((task) => ({
        id: task.id,
        type: task.payload.type,
        storageKey: task.payload.storageKey,
      })),
      skippedTasks: nonFailedTasks.map((task) => ({
        id: task.id,
        status: task.status,
        reason: `Task is not in failed status (current: ${task.status})`,
      })),
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Failed to batch retry tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to batch retry tasks',
    })
  }
})
