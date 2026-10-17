import { and, eq, inArray } from 'drizzle-orm'

/** 删除指定的已完成或失败任务。 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const taskId = Number(getRouterParam(event, 'taskId'))
  if (!Number.isSafeInteger(taskId) || taskId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID must be a positive integer',
    })
  }

  const db = useDB()
  // 将状态限制放在删除语句中，避免删除已被重试的任务。
  const deletedTask = db
    .delete(tables.pipelineQueue)
    .where(
      and(
        eq(tables.pipelineQueue.id, taskId),
        inArray(tables.pipelineQueue.status, ['completed', 'failed']),
      ),
    )
    .returning({ id: tables.pipelineQueue.id })
    .get()

  if (!deletedTask) {
    const task = db
      .select({ id: tables.pipelineQueue.id })
      .from(tables.pipelineQueue)
      .where(eq(tables.pipelineQueue.id, taskId))
      .get()

    throw createError({
      statusCode: task ? 409 : 404,
      statusMessage: task
        ? 'Only completed or failed tasks can be deleted'
        : 'Task not found',
    })
  }

  return { success: true, taskId: deletedTask.id }
})
