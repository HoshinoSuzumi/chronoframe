import { eventHandler, type EventHandler } from 'h3'
import { settingsManager } from '../services/settings/settingsManager'
import { createWizardGuard } from '../services/wizard-guard'

const guard = createWizardGuard(() =>
  settingsManager.get('system', 'firstLaunch'),
)

export function defineWizardHandler(handler: EventHandler) {
  return eventHandler((event) => guard(() => handler(event)))
}
