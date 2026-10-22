import type {} from '../../../types/worker'
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const workerPool = globalThis.__workerPool

    if (!workerPool) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Worker pool not initialized',
      })
    }

    const poolStats = workerPool.getPoolStats()
    const queueStats = await workerPool.getQueueStats()

    return {
      timestamp: new Date().toISOString(),
      pool: {
        isActive: workerPool.isActive(),
        workerCount: workerPool.getWorkerCount(),
        ...poolStats,
      },
      queue: queueStats,
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage:
        error instanceof Error ? error.message : 'Failed to get queue status',
    })
  }
})
