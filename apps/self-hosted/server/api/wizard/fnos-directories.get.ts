import { defineWizardHandler } from '../../utils/wizard-handler'
import { fnosStorageDirectories } from '../../utils/fnos-storage'

export default defineWizardHandler(async () => ({
  directories: await fnosStorageDirectories(),
}))
