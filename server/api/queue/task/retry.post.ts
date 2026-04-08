import { z } from 'zod'
import { eq } from 'drizzle-orm'

/**
 * 重试指定的失败任务
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

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
      .where(eq(tables.pipelineQueue.id, taskId))
      .get()

    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found',
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
        statusStage: null,
        errorMessage: null,
        attempts: 0, // 重置尝试次数
        createdAt: new Date(), // 更新创建时间以便重新调度
      })
      .where(eq(tables.pipelineQueue.id, taskId))

    return {
      success: true,
      message: `Task ${taskId} has been reset and will be retried`,
      taskId,
      payload: {
        type: task.payload.type,
        storageKey: task.payload.storageKey,
      },
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
