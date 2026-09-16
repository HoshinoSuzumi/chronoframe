import { z } from 'zod'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  try {
    const payloadSchema = z.discriminatedUnion('type', [
      z.object({
        type: z.literal('photo'),
        storageKey: z.string().nonempty(),
        eraseLocation: z.boolean().optional(),
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
      z.object({
        type: z.literal('photo-erase-location'),
        photoId: z.string().min(1),
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

    // Fail fast when the upload never landed (e.g. rejected by the MIME
    // whitelist or a reverse proxy) instead of letting the queue retry
    // against a key that does not exist and report "Storage object not found".
    //
    // The check must never download the object on the request path, so it is
    // only authoritative where it is cheap: the local provider (a stat plus a
    // disk read). For remote providers an empty metadata result may just be a
    // backend quirk or a transient error, so the task is let through and the
    // worker decides, as it did before.
    if (payload.type === 'photo' || payload.type === 'live-photo-video') {
      const { storageProvider } = useStorageProvider(event)
      const isLocal = storageProvider.config?.provider === 'local'
      let exists = !!(await storageProvider.getFileMeta(payload.storageKey))
      if (!exists && isLocal) {
        exists = !!(await storageProvider.get(payload.storageKey))
      }
      if (!exists && isLocal) {
        throw createError({
          statusCode: 404,
          statusMessage: `Storage object not found: ${payload.storageKey}`,
        })
      }
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
