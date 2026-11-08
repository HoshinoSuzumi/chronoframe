import {
  resolveAppSecretCandidate,
  validateAppSecret,
} from '../utils/app-secret-validation.mjs'

const MESSAGE =
  'Production requires NUXT_APP_SECRET (or NITRO_APP_SECRET) as a string with at least 32 characters. Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"'

/** Fail fast in production before requests hit OG signing with a missing secret. */
export default defineNitroPlugin(() => {
  if (import.meta.dev) return
  const config = useRuntimeConfig()
  const secret = resolveAppSecretCandidate(config.appSecret)
  // Restore a string into runtimeConfig so OG signing does not see a coerced number.
  config.appSecret = validateAppSecret(
    typeof secret === 'string' ? secret : '',
    MESSAGE,
  )
})
