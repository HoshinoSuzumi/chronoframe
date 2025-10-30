import { DEFAULT_SETTINGS } from '../services/settings/contants'
import { settingsManager } from '../services/settings/settingsManager'

export default defineNitroPlugin(async (_nitroApp) => {
  const _settingsManager = settingsManager
  await _settingsManager.init(DEFAULT_SETTINGS)
})
