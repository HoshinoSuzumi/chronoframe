import {
  resolveAppSecretCandidate,
  validateAppSecret,
} from '../utils/app-secret-validation.mjs'

const MESSAGE =
  'Production requires NUXT_APP_SECRET (or NITRO_APP_SECRET) as a string with at least 32 characters. Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"'

const NON_STRING_MESSAGE =
  'Production app secret was parsed as a non-string by Nitro. Quote the value so OG signing receives a string, for example NUXT_APP_SECRET=\'"your-secret"\'.'

/** Fail fast in production before requests hit OG signing with a missing secret. */
export default defineNitroPlugin(() => {
  if (import.meta.dev) return
  const config = useRuntimeConfig()
  // Prefer the original env spelling when Nitro/destr coerces numeric overrides.
  // Do not assign onto the frozen shared runtimeConfig (that throws in production).
  const candidate = resolveAppSecretCandidate(config.appSecret)
  const appSecret = validateAppSecret(
    typeof candidate === 'string' ? candidate : '',
    MESSAGE,
  )
  // OG signing reads useRuntimeConfig().appSecret (or legacy NUXT_OG_IMAGE_SECRET).
  // A coerced non-string cannot be repaired without mutating the frozen config.
  if (typeof config.appSecret !== 'string') throw new Error(NON_STRING_MESSAGE)
  if (config.appSecret !== '' && config.appSecret !== appSecret)
    throw new Error(NON_STRING_MESSAGE)
})
