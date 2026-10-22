import type {} from '../../types/worker'
import { z } from 'zod'
import {
  createPhotoTaskAlbumChecker,
  queuePayloadRequiresAdmin,
  queuePayloadSchema,
} from '../../utils/queue-payload.ts'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  try {
    const { tasks, defaultPriority, defaultMaxAttempts } =
      await readValidatedBody(
        event,
        z.object({
          tasks: z
            .array(
              z.object({
                payload: queuePayloadSchema,
                priority: z.number().min(0).max(9).optional(),
                maxAttempts: z.number().min(1).max(5).optional(),
              }),
            )
            .min(1, 'At least one task is required')
            .max(1000, 'Too many tasks: maximum 1000 tasks per batch'),
          defaultPriority: z.number().min(0).max(9).optional().default(0),
          defaultMaxAttempts: z.number().min(1).max(5).optional().default(3),
        }).parse,
      )

    if (
      tasks.some((task) => queuePayloadRequiresAdmin(task.payload)) &&
      !session.user.isAdmin
    )
      throw createError({
        statusCode: 403,
        statusMessage: 'Admin privileges required',
      })

    const workerPool = globalThis.__workerPool

    if (!workerPool) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Worker pool not initialized',
      })
    }

    const results = []
    const errors = []
    const albumExists = createPhotoTaskAlbumChecker()

    for (const [i, task] of tasks.entries()) {
      try {
        if (!albumExists(task.payload)) {
          throw createError({
            statusCode: 404,
            statusMessage: 'Album not found',
          })
        }
        const taskId = await workerPool.addTask(task.payload, {
          priority: task.priority ?? defaultPriority,
          maxAttempts: task.maxAttempts ?? defaultMaxAttempts,
        })

        results.push({ index: i, taskId, payload: task.payload, success: true })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : `Task ${i}: Unknown error`
        errors.push({
          index: i,
          payload: task.payload,
          error: errorMessage,
          success: false,
        })
      }
    }

    return {
      success: errors.length === 0,
      totalTasks: tasks.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: `Processed ${tasks.length} tasks: ${results.length} successful, ${errors.length} failed`,
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage:
        error instanceof Error ? error.message : 'Failed to add tasks to queue',
    })
  }
})
