import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { storageConfigSchema } from '~~/shared/types/storage'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(
    event,
    z.object({
      name: z.string().min(1),
      config: storageConfigSchema,
    }).parse,
  )

  const id = await settingsManager.storage.addProvider({
    name: body.name,
    provider: body.config.provider,
    config: body.config,
  })

  // Set as active provider if it's the first one or explicitly requested?
  // The addProvider method already sets it as active if it's the only one.
  // We might want to force set it as active here since it's the wizard.
  await settingsManager.set('storage', 'provider', id)

  return { success: true, id }
})
