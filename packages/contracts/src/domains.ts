/** Hostnames used by platform services cannot be allocated to public galleries. */
export const RESERVED_SITE_SLUGS = [
  'www',
  'app',
  'api',
  'admin',
  'account',
  'auth',
  'cloud',
  'site',
  'sites',
  'cname',
  'staging',
  'preview',
  'production',
  'dev',
  'test',
  'mail',
  'email',
  'smtp',
  'noreply',
  'support',
  'help',
  'docs',
  'status',
  'assets',
  'static',
  'cdn',
  'chronoframe',
] as const
export const DEFAULT_SITE_BASE = 'chronoframe.art'
export const DEFAULT_CNAME_TARGET = 'cname.chronoframe.art'
export function validSiteSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(value) &&
    !(RESERVED_SITE_SLUGS as readonly string[]).includes(value)
  )
}
/** Accept a hostname, including IDN, rather than silently discarding URL components. */
export function normalizeDomain(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 253 ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    !value.trim() ||
    /[\s/:@?#\\%*]/.test(value.trim())
  )
    throw new Error('Invalid domain')
  const input = value.trim().replace(/\.$/, '').toLowerCase()
  const host = new URL('https://' + input).hostname
  if (
    host.length > 253 ||
    !host.includes('.') ||
    /^[0-9.]+$/.test(host) ||
    !host
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new Error('Invalid domain')
  return host
}
export function defaultSiteHost(
  slug: string,
  base = DEFAULT_SITE_BASE,
): string {
  if (!validSiteSlug(slug)) throw new Error('Invalid site address')
  return slug + '.' + normalizeDomain(base)
}
export type DomainStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'deleting'
  | 'deleted'
  | 'expired'
export interface CustomDomain {
  hostname: string
  siteId: number
  generation: string
  revision: number
  status: DomainStatus
  dnsStatus: 'awaiting_change' | 'missing' | 'ready' | 'unknown'
  hostnameStatus: string
  sslStatus: string
  error: string | null
  primary: boolean
  redirects: boolean
  createdAt: number
  checkedAt: number | null
  expiresAt: number
  nextCheckAt: number
}
export interface DomainOverview {
  defaultHostname: string | null
  legacyHostname: string | null
  baseDomain: string
  cnameTarget: string
  enabled: boolean
  defaultReady: boolean
  routingReady: boolean
  admin: boolean
  domains: CustomDomain[]
}
