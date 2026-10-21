import { defineWizardHandler } from '../../utils/wizard-handler'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default defineWizardHandler(async (_event) => {
  // Set firstLaunch to false
  // Pass true as the last argument (sudo) to bypass readonly check
  await settingsManager.set('system', 'firstLaunch', false, undefined, true)

  return { success: true }
})
