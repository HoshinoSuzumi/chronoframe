import type {} from '../../../types/worker'
import z from 'zod'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const { taskId } = await getValidatedRouterParams(
      event,
      z.object({
        taskId: z.string().nonempty(),
      }).parse,
    )

    const workerPool = globalThis.__workerPool
    if (!workerPool) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Worker pool not initialized',
      })
    }

    const taskStats = await workerPool.getTaskStatus(Number(taskId))
    if (!taskStats) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found',
      })
    }

    return taskStats
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage:
        error instanceof Error ? error.message : 'Failed to get queue status',
    })
  }
})
