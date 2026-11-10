import { validateAppSecret } from './app-secret-validation.mjs'

/** Read the approved environment's private Worker key, never a platform key. */
export function edgeAppSecretForOgDeployment(entry, env = process.env) {
  if (!['cloud', 'site'].includes(entry))
    throw new Error('Expected cloud or site entry')
  const key = entry === 'cloud' ? 'CLOUD_APP_SECRET' : 'SITE_APP_SECRET'
  return validateAppSecret(
    env[key],
    `Configure ${key} with at least 32 characters in the selected GitHub Environment secrets`,
  )
}
