import type {} from '../../types/worker'
import { z } from 'zod'
import {
  photoTaskAlbumExists,
  queuePayloadRequiresAdmin,
  queuePayloadSchema,
} from '../../utils/queue-payload.ts'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  try {
    const { payload, priority, maxAttempts } = await readValidatedBody(
      event,
      z.object({
        payload: queuePayloadSchema,
        priority: z.number().min(0).max(9).optional().default(0),
        maxAttempts: z.number().min(1).max(5).optional().default(3),
      }).parse,
    )

    if (queuePayloadRequiresAdmin(payload) && !session.user.isAdmin)
      throw createError({
        statusCode: 403,
        statusMessage: 'Admin privileges required',
      })
    if (!photoTaskAlbumExists(payload)) {
      throw createError({ statusCode: 404, statusMessage: 'Album not found' })
    }

    const workerPool = globalThis.__workerPool

    if (!workerPool) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Worker pool not initialized',
      })
    }

    const taskId = await workerPool.addTask(payload, {
      priority,
      maxAttempts,
    })

    return {
      success: true,
      taskId,
      message: 'Task added to queue successfully',
      payload,
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage:
        error instanceof Error ? error.message : 'Failed to add task to queue',
    })
  }
})
