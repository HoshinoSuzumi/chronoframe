import { and as siteAnd, eq as siteEq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
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
      siteAnd(
        and(
          eq(tables.pipelineQueue.id, taskId),
          inArray(tables.pipelineQueue.status, ['completed', 'failed']),
        ),
        siteEq(tables.pipelineQueue.siteId, DEFAULT_SITE.id),
      ),
    )
    .returning({ id: tables.pipelineQueue.id })
    .get()

  if (!deletedTask) {
    const task = db
      .select({ id: tables.pipelineQueue.id })
      .from(tables.pipelineQueue)
      .where(
        siteAnd(
          eq(tables.pipelineQueue.id, taskId),
          siteEq(tables.pipelineQueue.siteId, DEFAULT_SITE.id),
        ),
      )
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
