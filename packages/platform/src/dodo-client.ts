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
    // Workers supports only follow/manual. Never forward authorization to a redirected origin.
    const response = await transport(input, { ...init, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined)
      throw new SubscriptionError(502, 'payment_provider_redirect_blocked')
    }
    return response
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
const productFields = new Set([
  'name',
  'description',
  'tax_category',
  'price',
  'price.currency',
  'price.price',
  'price.discount',
  'price.discount_bps',
  'price.payment_frequency_count',
  'price.payment_frequency_interval',
  'price.subscription_period_count',
  'price.subscription_period_interval',
  'price.tax_inclusive',
  'price.trial_period_days',
  'metadata',
])
function validationField(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return
  const value = body as Record<string, unknown>
  const entries = Array.isArray(value.detail)
    ? value.detail
    : Array.isArray(value.errors)
      ? value.errors
      : [value]
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const field = entry as Record<string, unknown>
    const path = Array.isArray(field.loc)
      ? field.loc
          .filter((part) => typeof part === 'string' && part !== 'body')
          .join('.')
      : (field.field ?? field.param ?? field.path)
    if (typeof path === 'string' && productFields.has(path)) return path
  }
  // Retain only a known schema field from older API validation messages, never the message or values.
  const missing =
    typeof value.message === 'string'
      ? /missing field [`'"]([a-z_]+)[`'"]/.exec(value.message)?.[1]
      : undefined
  if (missing && productFields.has('price.' + missing))
    return 'price.' + missing
}
export class DodoProviderError extends SubscriptionError {
  providerStatus?: number
  providerField?: string
  constructor(code: string, providerStatus?: number, providerField?: string) {
    super(502, code)
    this.providerStatus = providerStatus
    this.providerField = providerField
  }
  diagnostic() {
    return [
      this.code,
      this.providerStatus ? 'http_' + this.providerStatus : null,
      this.providerField,
    ]
      .filter(Boolean)
      .join(':')
  }
}
/** Persist only typed HTTP status and allowlisted field names, never SDK bodies, headers or messages. */
export async function dodoRequest<T>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof SubscriptionError) throw error
    if (
      error instanceof DodoPayments.APIConnectionError &&
      error.cause instanceof SubscriptionError
    )
      throw error.cause
    if (error instanceof DodoPayments.APIConnectionTimeoutError)
      throw new DodoProviderError('payment_provider_timeout')
    if (error instanceof DodoPayments.APIError && error.status) {
      const status = error.status
      const code =
        status === 401
          ? 'payment_provider_authentication_failed'
          : status === 403
            ? 'payment_provider_permission_denied'
            : status === 400 || status === 422
              ? 'payment_provider_validation_failed'
              : status === 429
                ? 'payment_provider_rate_limited'
                : status >= 500
                  ? 'payment_provider_unavailable'
                  : 'payment_provider_request_failed'
      throw new DodoProviderError(
        code,
        status,
        status === 400 || status === 422
          ? validationField(error.error)
          : undefined,
      )
    }
    throw new DodoProviderError(
      error instanceof DodoPayments.APIConnectionError
        ? 'payment_provider_connection_failed'
        : 'payment_provider_request_failed',
    )
  }
}
