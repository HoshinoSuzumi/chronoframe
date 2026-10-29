import DodoPayments from 'dodopayments'
import type { PlatformD1 } from './index.ts'
import { openProviderCredentials } from './payment-providers.ts'
import { SubscriptionError } from './subscriptions.ts'
export type DodoEnvironment = 'test' | 'live'
export const dodoId = (environment: string, id: string) =>
  `dodo:${environment}:${id}`
export const rawDodoId = (id: string) => id.replace(/^dodo:[a-zA-Z0-9_-]+:/, '')
export function dodoURL(value: unknown, environment: DodoEnvironment) {
  try {
    const url = new URL(String(value))
    if (
      url.origin !==
        (environment === 'test'
          ? 'https://test.checkout.dodopayments.com'
          : 'https://checkout.dodopayments.com') ||
      url.username ||
      url.password
    )
      throw Error()
    return url.href
  } catch {
    throw new SubscriptionError(502, 'payment_redirect_invalid')
  }
}
/** Every outbound SDK request rechecks the active environment and payment switch. */
export async function dodoClient(
  db: PlatformD1,
  secret: string,
  environment: DodoEnvironment,
  transport: typeof fetch = fetch,
  purchase = false,
  expectedId?: string,
) {
  const row = await db
    .prepare(
      "SELECT p.* FROM platform_payment_providers p JOIN platform_payment_settings s ON s.current_provider=p.id WHERE s.id=1 AND s.enabled=1 AND p.provider='dodo' AND p.environment=? AND (?=0 OR s.purchase_method='payment')",
    )
    .bind(environment, purchase ? 1 : 0)
    .first<any>()
  if (
    !row?.credentials_ciphertext ||
    row.environment !== environment ||
    (expectedId && row.id !== expectedId)
  )
    throw new SubscriptionError(503, 'payment_unavailable')
  const id = String(row.id)
  const credentials = await openProviderCredentials(
    secret,
    id,
    environment,
    row.credentials_ciphertext,
  )
  const guardedFetch: typeof fetch = async (input, init) => {
    const current = await db
      .prepare(
        "SELECT p.revision FROM platform_payment_settings s JOIN platform_payment_providers p ON p.id=s.current_provider WHERE s.id=1 AND s.enabled=1 AND p.id=? AND p.revision=? AND (?=0 OR s.purchase_method='payment')",
      )
      .bind(id, row.revision, purchase ? 1 : 0)
      .first()
    if (!current) throw new SubscriptionError(503, 'payment_unavailable')
    return transport(input, { ...init, redirect: 'error' })
  }
  return {
    revision: Number(row.revision),
    key: id,
    client: new DodoPayments({
      bearerToken: credentials.apiKey,
      webhookKey: credentials.webhookSecret,
      environment: environment === 'test' ? 'test_mode' : 'live_mode',
      baseURL: null,
      fetch: guardedFetch,
      timeout: 10000,
      maxRetries: 0,
      logLevel: 'off',
    }),
  }
}
/** Provider bodies and SDK errors can contain credentials or customer data. */
export async function dodoRequest<T>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof SubscriptionError) throw error
    throw new SubscriptionError(502, 'payment_provider_request_failed')
  }
}
