import { z } from 'zod'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const payloadSchema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('photo'),
        storageKey: z.string().nonempty(),
      }),
      z.object({
        type: z.literal('live-photo-video'),
        storageKey: z.string().nonempty(),
      }),
      z.object({
        type: z.literal('photo-reverse-geocoding'),
        photoId: z.string().min(1),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      }),
    ])

    const { payload, priority, maxAttempts } = await readValidatedBody(
      event,
      z.object({
        payload: payloadSchema,
        priority: z.number().min(0).max(9).optional().default(0),
        maxAttempts: z.number().min(1).max(5).optional().default(3),
      }).parse,
    )

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
