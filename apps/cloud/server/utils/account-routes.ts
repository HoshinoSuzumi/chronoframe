/** Explicit public account surface; internal OTP retrieval and unrelated plugin APIs stay closed. */
export const ACCOUNT_POST_ROUTES = new Set([
  '/sign-up/email',
  '/sign-in/email',
  '/sign-in/email-otp',
  '/sign-out',
  '/email-otp/send-verification-otp',
  '/email-otp/verify-email',
  '/request-password-reset',
  '/reset-password',
  '/change-password',
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/two-factor/generate-backup-codes',
  '/passkey/verify-registration',
  '/passkey/verify-authentication',
  '/passkey/delete-passkey',
])
export const ACCOUNT_GET_ROUTES = new Set([
  '/get-session',
  '/passkey/generate-register-options',
  '/passkey/generate-authenticate-options',
  '/passkey/list-user-passkeys',
])
export function accountRouteAllowed(path: string, method?: string) {
  const endpoint = path.replace(/^\/api\/auth/, '')
  return (
    ((!method || method === 'POST') && ACCOUNT_POST_ROUTES.has(endpoint)) ||
    ((!method || method === 'GET') &&
      (ACCOUNT_GET_ROUTES.has(endpoint) ||
        /^\/reset-password\/[a-zA-Z0-9_-]{10,256}$/.test(endpoint)))
  )
}
