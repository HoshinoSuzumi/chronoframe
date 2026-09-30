import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(
    event,
    z.object({
      provider: z.enum(['mapbox', 'maplibre']),
      token: z.string().optional().default(''),
      style: z.string().optional(),
    }).parse,
  )

  await settingsManager.set('map', 'provider', body.provider)
  const mapToken = body.token.trim()

  if (body.provider === 'mapbox') {
    if (mapToken) await settingsManager.set('map', 'mapbox.token', mapToken)
    if (body.style) await settingsManager.set('map', 'mapbox.style', body.style)
  } else {
    if (mapToken) await settingsManager.set('map', 'maplibre.token', mapToken)
    if (body.style)
      await settingsManager.set('map', 'maplibre.style', body.style)
  }

  return { success: true }
})
