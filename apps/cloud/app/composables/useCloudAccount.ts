import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
/** Only browser ceremonies use this client; SSR identity is fetched through useRequestFetch. */
export function useCloudAccount() {
  return createAuthClient({
    baseURL: useRequestURL().origin,
    basePath: '/api/auth',
    plugins: [emailOTPClient(), twoFactorClient(), passkeyClient()],
  })
}
