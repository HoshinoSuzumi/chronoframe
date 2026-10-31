import {
  isProcessorAction,
  type ProcessorAction as WorkerAction,
} from '@chronoframe/contracts/processor'
import {
  ProcessorConnectionError,
  connectionNetworkCodes,
} from './diagnostics.ts'
interface GatewayConfig {
  origin: string
  secret: string
  accessClientId?: string
  accessClientSecret?: string
}
/** Service credentials belong only on the fixed portal gateway, never on S3 grants. */
export function createWorkerGateway(
  config: GatewayConfig,
  transport: typeof fetch = fetch,
) {
  const {
    origin,
    secret,
    accessClientId = '',
    accessClientSecret = '',
  } = config
  let validOrigin = false
  try {
    const url = new URL(origin)
    validOrigin = url.protocol === 'https:' && url.origin === origin
  } catch {
    /* Report configuration errors without reflecting input values. */
  }
  if (!validOrigin || secret.length < 32)
    throw new Error(
      'Configure an HTTPS portal origin and generated worker credential',
    )
  if (Boolean(accessClientId) !== Boolean(accessClientSecret))
    throw new Error(
      'Configure both Cloudflare Access service credentials or neither',
    )
  for (const value of [accessClientId, accessClientSecret]) {
    if (
      value.length > 2048 ||
      Array.from(value).some(
        (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) > 126,
      )
    )
      throw new Error('Invalid Cloudflare Access service credential')
  }
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + secret,
    'Content-Type': 'application/json',
    ...(accessClientId
      ? {
          'CF-Access-Client-Id': accessClientId,
          'CF-Access-Client-Secret': accessClientSecret,
        }
      : {}),
  }
  return async function rpc<T>(
    action: WorkerAction,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!isProcessorAction(action))
      throw new Error('Invalid worker gateway action')
    let response: Response
    try {
      response = await transport(origin + '/api/internal/worker/' + action, {
        method: 'POST',
        redirect: 'manual',
        headers,
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(30000),
      })
    } catch (error) {
      throw new ProcessorConnectionError(
        'portal_transport_failed',
        action,
        undefined,
        undefined,
        connectionNetworkCodes(error),
      )
    }
    const ray = response.headers.get('cf-ray') ?? ''
    const cfRay = /^[a-f0-9]{16,32}(?:-[a-z0-9]{3,10})?$/i.test(ray)
      ? ray
      : undefined
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {})
      throw new ProcessorConnectionError(
        'portal_redirect',
        action,
        response.status,
        cfRay,
      )
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new ProcessorConnectionError(
        'portal_request_failed',
        action,
        response.status,
        cfRay,
      )
    }
    try {
      return (await response.json()) as T
    } catch {
      throw new ProcessorConnectionError(
        'portal_response_invalid',
        action,
        response.status,
        cfRay,
      )
    }
  }
}
