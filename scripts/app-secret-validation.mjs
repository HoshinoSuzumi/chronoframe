/** Pure validation shared by Node bootstrap and Worker deployment tooling. */
export function validateAppSecret(secret, message) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error(message)
  return secret
}

/**
 * Nitro/destr may coerce numeric-looking env overrides into numbers in
 * runtimeConfig.appSecret. Prefer the original env spelling so validation and
 * OG signing keep a string of the required length.
 */
export function resolveAppSecretCandidate(configSecret, env = process.env) {
  const raw =
    env.NITRO_APP_SECRET !== undefined
      ? env.NITRO_APP_SECRET
      : env.NUXT_APP_SECRET !== undefined
        ? env.NUXT_APP_SECRET
        : undefined
  let secret = raw !== undefined ? decodeEnvAppSecret(raw) : configSecret
  if (
    (secret === undefined || secret === null || secret === '') &&
    env.NUXT_OG_IMAGE_SECRET
  )
    secret = env.NUXT_OG_IMAGE_SECRET
  return secret
}

function decodeEnvAppSecret(value) {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === 'string') return parsed
    // Keep the supplied spelling for numeric/boolean JSON env forms.
    if (parsed !== null && typeof parsed !== 'object') return value
  } catch {
    // Unquoted ordinary strings are also supported by Nitro's env parser.
  }
  return value
}
