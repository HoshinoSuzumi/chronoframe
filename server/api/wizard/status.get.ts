import { readBootstrapDbConfig } from '~~/server/utils/db-bootstrap'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (_event) => {
  const config = await readBootstrapDbConfig()

  if (!config) {
    return {
      dbConfigured: false,
      onboardingRequired: true,
    }
  }

  try {
    // If the key is missing (e.g. defaults not initialized yet), treat as first launch.
    const firstLaunch = await settingsManager.get<boolean>(
      'system',
      'firstLaunch',
      true,
    )

    return {
      dbConfigured: true,
      onboardingRequired: firstLaunch !== false,
    }
  } catch {
    // Conservative fallback: keep user in onboarding until status can be confirmed.
    return {
      dbConfigured: true,
      onboardingRequired: true,
    }
  }
})
