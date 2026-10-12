import { z } from 'zod'
import { tourIds } from '~~/shared/types/tours'
import { settingsManager } from '~~/server/services/settings/settingsManager'
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin)
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  if (event.method === 'PUT') {
    const body = await readValidatedBody(
      event,
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('reset') }),
        z.object({
          action: z.literal('set'),
          id: z.enum(tourIds),
          status: z.enum(['pending', 'completed', 'skipped']),
        }),
      ]).parse,
    )
    for (const id of body.action === 'reset' ? tourIds : [body.id])
      await settingsManager.set(
        'system',
        `tour.${id}`,
        body.action === 'reset' ? 'pending' : body.status,
        undefined,
        true,
      )
  } else if (event.method !== 'GET') throw createError({ statusCode: 405 })
  return Object.fromEntries(
    await Promise.all(
      tourIds.map(async (id) => [
        id,
        await settingsManager.get('system', `tour.${id}`, 'pending'),
      ]),
    ),
  )
})
