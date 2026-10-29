import { defineWizardHandler } from '../../utils/wizard-handler'
import {
  persistWizardSiteSettings,
  wizardSiteSchema,
} from '~~/server/services/wizard/site-settings'

export default defineWizardHandler(async (event) => {
  const body = await readValidatedBody(event, wizardSiteSchema.parse)

  await persistWizardSiteSettings(body)

  return { success: true }
})
