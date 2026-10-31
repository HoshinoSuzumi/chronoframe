/** Shared allowlist for the Cloud boundary and processing-node transport. */
export const PROCESSOR_ACTIONS = [
  'register',
  'status',
  'geocoding-slot',
  'claim',
  'heartbeat',
  'grant',
  'complete',
  'fail',
  'cleanup',
] as const
export type ProcessorAction = (typeof PROCESSOR_ACTIONS)[number]
export function isProcessorAction(value: unknown): value is ProcessorAction {
  return (
    typeof value === 'string' &&
    PROCESSOR_ACTIONS.some((action) => action === value)
  )
}
/** Server-owned processing policy; shared by Cloud and Docker processing nodes. */
export interface ProcessorLimits {
  maxFileBytes: number
  maxPixels: number
  maxMetadataBytes: number
  timeoutMs: number
}
export const DEFAULT_PROCESSOR_LIMITS: ProcessorLimits = {
  maxFileBytes: 1073741824,
  maxPixels: 100000000,
  maxMetadataBytes: 61440,
  timeoutMs: 180000,
}
export function parseProcessorLimits(value: unknown): ProcessorLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid processing limits')
  const input = value as Record<string, unknown>
  const result = { ...DEFAULT_PROCESSOR_LIMITS }
  const ranges = {
    maxFileBytes: [1048576, 8589934592],
    maxPixels: [1000000, 1000000000],
    maxMetadataBytes: [1024, 524288],
    timeoutMs: [30000, 3600000],
  } as const
  if (Object.keys(input).some((key) => !(key in ranges)))
    throw new Error('Invalid processing limits')
  for (const key of Object.keys(ranges) as (keyof ProcessorLimits)[]) {
    const v = input[key] ?? result[key],
      [min, max] = ranges[key]
    if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max)
      throw new Error('Invalid processing limits')
    result[key] = Number(v)
  }
  return result
}
export interface ProcessorGeocoding {
  provider: 'none' | 'mapbox' | 'nominatim'
  token: string
  endpoint: string
  language: string
}
export const DEFAULT_PROCESSOR_GEOCODING: ProcessorGeocoding = {
  provider: 'none',
  token: '',
  endpoint: 'https://nominatim.openstreetmap.org',
  language: 'en',
}
export function parseProcessorGeocoding(value: unknown): ProcessorGeocoding {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid geocoding settings')
  const input = value as Record<string, unknown>
  if (!['none', 'mapbox', 'nominatim'].includes(String(input.provider)))
    throw new Error('Invalid geocoding provider')
  const result = {
    ...DEFAULT_PROCESSOR_GEOCODING,
    ...input,
  } as ProcessorGeocoding
  for (const key of ['token', 'endpoint', 'language'] as const)
    if (
      typeof result[key] !== 'string' ||
      result[key].length > (key === 'language' ? 40 : 2048) ||
      Array.from(result[key]).some(
        (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
      )
    )
      throw new Error('Invalid geocoding settings')
  if (result.provider === 'mapbox' && !result.token)
    throw new Error('Mapbox credential required')
  const url = new URL(result.endpoint)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ['localhost', '0.0.0.0', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('Invalid geocoding endpoint')
  if (!/^[a-zA-Z0-9,-]+$/.test(result.language))
    throw new Error('Invalid geocoding language')
  return {
    provider: result.provider,
    token: result.token,
    endpoint: result.endpoint.replace(/\/$/, ''),
    language: result.language,
  }
}
export interface ProcessorEnvelope {
  nodeId: string
  revision: string
  issuedAt: number
  expiresAt: number
  nonce: string
  envelope: string
}
export interface ProcessorConfiguration {
  limits: ProcessorLimits
  geocoding: ProcessorGeocoding
}
const encoder = new TextEncoder()
const encode = (v: Uint8Array) => btoa(String.fromCharCode(...v))
const decode = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0))
/** Dedicated HKDF domain; authenticated context prevents cross-node/revision substitution. */
export async function processorCipher(secret: string) {
  if (secret.length < 32) throw new Error('Invalid processor key')
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('chronoframe-processor-v1'),
      info: encoder.encode('configuration'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return {
    async seal(value: unknown, context: string) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const body = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
        key,
        encoder.encode(JSON.stringify(value)),
      )
      return 'v1.' + encode(iv) + '.' + encode(new Uint8Array(body))
    },
    async open<T>(value: string, context: string): Promise<T> {
      const [version, iv, body, ...rest] = value.split('.')
      if (
        version !== 'v1' ||
        !iv ||
        !body ||
        rest.length ||
        value.length > 16384
      )
        throw new Error('Invalid processor envelope')
      const plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decode(iv),
          additionalData: encoder.encode(context),
        },
        key,
        decode(body),
      )
      return JSON.parse(new TextDecoder().decode(plain))
    },
  }
}
export async function processorKeyHash(key: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(key))),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('')
}
