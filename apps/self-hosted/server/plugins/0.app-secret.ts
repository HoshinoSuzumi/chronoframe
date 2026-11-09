import {
  resolveAppSecretCandidate,
  validateAppSecret,
} from '../utils/app-secret-validation.mjs'

const MESSAGE =
  "Production requires a usable app secret (NUXT_APP_SECRET, NITRO_APP_SECRET, NUXT_OG_IMAGE_SECRET, or data/.app-secret) as a string with at least 32 characters. Generate one with: node -e \"console.log(require('node:crypto').randomBytes(48).toString('base64url'))\""

const NON_STRING_MESSAGE =
  'Production app secret was parsed as a non-string by Nitro. Quote the value so OG signing receives a string, for example NUXT_APP_SECRET=\'"your-secret"\'.'

const MISMATCH_MESSAGE =
  'Production app secret from the environment does not match runtimeConfig.appSecret. Check NITRO_APP_SECRET / NUXT_APP_SECRET for conflicting overrides or expansion.'

const EMPTY_OVERRIDE_MESSAGE =
  'Production app secret override was set but runtimeConfig.appSecret is empty. Remove the empty override or provide a valid NUXT_APP_SECRET / NITRO_APP_SECRET string.'

/** Fail fast in production before requests hit OG signing with a missing secret. */
export default defineNitroPlugin(() => {
  if (import.meta.dev) return
  const config = useRuntimeConfig()
  // Prefer the original env spelling when Nitro/destr coerces numeric overrides.
  // Do not assign onto the frozen shared runtimeConfig (that throws in production).
  // Production Node entries initialize NUXT_APP_SECRET from data/.app-secret before
  // Nitro loads; this plugin only verifies the resolved secret after that bootstrap.
  const candidate = resolveAppSecretCandidate(config.appSecret)
  const appSecret = validateAppSecret(
    typeof candidate === 'string' ? candidate : '',
    MESSAGE,
  )
  // An empty NUXT_APP_SECRET is treated as unset by the Node bootstrap and the
  // example environment file, so a valid legacy NUXT_OG_IMAGE_SECRET remains a
  // fallback. NITRO_APP_SECRET is intentionally strict: even an empty value is
  // an explicit Nitro override and must be valid.
  const hasOverride =
    process.env.NITRO_APP_SECRET !== undefined ||
    Boolean(process.env.NUXT_APP_SECRET)
  // OG signing reads useRuntimeConfig().appSecret (or legacy NUXT_OG_IMAGE_SECRET).
  if (typeof config.appSecret !== 'string') throw new Error(NON_STRING_MESSAGE)
  if (hasOverride && config.appSecret === '')
    throw new Error(EMPTY_OVERRIDE_MESSAGE)
  if (config.appSecret !== '' && config.appSecret !== appSecret)
    throw new Error(MISMATCH_MESSAGE)
})
