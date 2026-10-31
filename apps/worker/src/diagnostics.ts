import type { ProcessorAction } from '@chronoframe/contracts/processor'
export type ProcessorConnectionCode =
  | 'portal_request_failed'
  | 'portal_redirect'
  | 'portal_response_invalid'
  | 'portal_transport_failed'
  | 'portal_configuration_invalid'
const networkCodes = new Set([
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])
export function connectionNetworkCodes(error: unknown): string[] {
  const result = new Set<string>(),
    seen = new Set<unknown>()
  function visit(value: unknown, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4 || seen.has(value))
      return
    seen.add(value)
    const item = value as {
      code?: unknown
      name?: unknown
      cause?: unknown
      errors?: unknown
    }
    if (typeof item.code === 'string' && networkCodes.has(item.code))
      result.add(item.code)
    if (item.name === 'TimeoutError') result.add('ETIMEDOUT')
    visit(item.cause, depth + 1)
    if (Array.isArray(item.errors))
      for (const nested of item.errors.slice(0, 8)) visit(nested, depth + 1)
  }
  visit(error)
  return [...result].slice(0, 8)
}
/** Contains only bounded classifications, never remote bodies, URLs, headers or exception messages. */
export class ProcessorConnectionError extends Error {
  readonly code: ProcessorConnectionCode
  readonly action: ProcessorAction
  readonly httpStatus?: number
  readonly cfRay?: string
  readonly networkCodes: string[]
  constructor(
    code: ProcessorConnectionCode,
    action: ProcessorAction,
    httpStatus?: number,
    cfRay?: string,
    networkCodes: string[] = [],
  ) {
    super(code)
    this.code = code
    this.action = action
    this.httpStatus = httpStatus
    this.cfRay = cfRay
    this.networkCodes = networkCodes
  }
  diagnostic() {
    let hint: string
    if (
      this.networkCodes.some((code) =>
        ['ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN'].includes(code),
      )
    )
      hint = 'container_network_unreachable'
    else if (
      this.networkCodes.some((code) =>
        ['ENOTFOUND', 'EAI_AGAIN'].includes(code),
      )
    )
      hint = 'container_dns_failure'
    else if (
      this.networkCodes.some(
        (code) => code.includes('CERT') || code.includes('VERIFY'),
      )
    )
      hint = 'container_tls_verification_failed'
    else if (this.networkCodes.includes('ETIMEDOUT'))
      hint = 'portal_connection_timeout'
    else if (this.code === 'portal_configuration_invalid')
      hint = 'node_key_or_protocol_configuration_mismatch'
    else if (this.code === 'portal_redirect')
      hint = 'portal_redirect_or_access_login'
    else if (this.httpStatus === 401)
      hint = 'node_key_invalid_revoked_or_disabled'
    else if (this.httpStatus === 403) hint = 'portal_origin_or_access_denied'
    else if (this.httpStatus === 400)
      hint = 'portal_protocol_mismatch_or_invalid_request'
    else if (this.httpStatus === 404 || this.httpStatus === 405)
      hint = 'portal_route_or_version_mismatch'
    else if (this.httpStatus === 429) hint = 'portal_rate_limited'
    else if (this.httpStatus && this.httpStatus >= 500)
      hint = 'portal_unavailable'
    else if (this.code === 'portal_response_invalid')
      hint = 'portal_non_json_response_or_access_login'
    else hint = 'portal_transport_failed'
    return {
      code: this.code,
      action: this.action,
      ...(this.httpStatus ? { httpStatus: this.httpStatus } : {}),
      ...(this.cfRay ? { cfRay: this.cfRay } : {}),
      ...(this.networkCodes.length ? { networkCodes: this.networkCodes } : {}),
      hint,
    }
  }
}
export function processorConnectionDiagnostic(error: unknown) {
  return error instanceof ProcessorConnectionError
    ? error.diagnostic()
    : {
        code: 'processor_connection_error',
        hint: 'inspect_cloud_and_processor_versions',
      }
}
