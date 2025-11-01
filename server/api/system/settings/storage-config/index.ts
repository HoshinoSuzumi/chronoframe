import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import {
  localStorageConfigSchema,
  openListStorageConfigSchema,
  s3StorageConfigSchema,
} from '~~/server/services/storage'

export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }

  switch (event.method) {
    case 'GET': {
      return await settingsManager.storage.getProviders()
    }
    case 'POST': {
      const newStorageConfig = await readValidatedBody(
        event,
        z.discriminatedUnion('provider', [
          z.object({
            name: z.string(),
            provider: z.literal('s3'),
            config: s3StorageConfigSchema,
          }),
          z.object({
            name: z.string(),
            provider: z.literal('local'),
            config: localStorageConfigSchema,
          }),
          z.object({
            name: z.string(),
            provider: z.literal('openlist'),
            config: openListStorageConfigSchema,
          }),
        ]).parse,
      )

      const newId = await settingsManager.storage.addProvider(newStorageConfig)
      return { id: newId }
    }
    default: {
      throw createError({
        statusCode: 405,
        statusMessage: 'Method Not Allowed',
      })
    }
  }
})
