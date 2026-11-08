import { validateAppSecret } from '../utils/app-secret-validation.mjs'

const MESSAGE =
  'Production requires NUXT_APP_SECRET (or NITRO_APP_SECRET) as a string with at least 32 characters. Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(48).toString(\'base64url\'))"'

/** Fail fast in production before requests hit OG signing with a missing secret. */
export default defineNitroPlugin(() => {
  if (import.meta.dev) return
  const config = useRuntimeConfig()
  let secret: unknown = config.appSecret
  if (
    (secret === undefined || secret === null || secret === '') &&
    process.env.NUXT_OG_IMAGE_SECRET
  ) {
    secret = process.env.NUXT_OG_IMAGE_SECRET
  }
  validateAppSecret(typeof secret === 'string' ? secret : '', MESSAGE)
})
