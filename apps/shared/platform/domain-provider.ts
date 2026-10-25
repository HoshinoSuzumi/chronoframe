import { normalizeDomain } from '@chronoframe/contracts/domains'
import { DomainError } from '../../../packages/platform/src/domains.ts'
import type {
  DomainProvider,
  DnsState,
} from '../../../packages/platform/src/domains.ts'

type Transport = typeof fetch
interface Hostname {
  id: string
  hostname: string
  status?: string
  ssl?: { status?: string }
}
interface Route {
  id: string
  pattern: string
  script?: string
}
/** Fixed provider origin, bounded responses and no redirect-based credential forwarding. */
export function createDomainProvider(
  config: { token: string; zoneId: string; siteWorker: string },
  transport: Transport = fetch,
): DomainProvider {
  if (
    !/^[a-f0-9]{32}$/i.test(config.zoneId) ||
    !config.token ||
    !/^chronoframe-site(?:-[a-z0-9-]+)?$/.test(config.siteWorker)
  )
    throw new DomainError(503, 'domain_unavailable')
  const base = `https://api.cloudflare.com/client/v4/zones/${config.zoneId}`
  const validResourceId = (value: string) =>
    /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
      value,
    )
  const id = (value: string) => {
    if (!validResourceId(value))
      throw new DomainError(503, 'domain_provider_unavailable')
    return value
  }
  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    allow404 = false,
  ): Promise<{
    result: T
    result_info?: { total_count?: number; total_pages?: number }
  } | null> {
    let response: Response
    try {
      response = await transport(base + path, {
        method,
        redirect: 'manual',
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw new DomainError(503, 'domain_provider_unavailable')
    }
    if (allow404 && response.status === 404) return null
    const text = await response.text()
    if (text.length > 262144)
      throw new DomainError(503, 'domain_provider_unavailable')
    let data: {
      success?: boolean
      result: T
      result_info?: { total_count?: number; total_pages?: number }
    }
    try {
      data = JSON.parse(text)
    } catch {
      throw new DomainError(503, 'domain_provider_unavailable')
    }
    if (!response.ok || !data.success)
      throw new DomainError(
        response.status === 429 ? 429 : 503,
        response.status === 429 ? 'domain_wait' : 'domain_provider_unavailable',
      )
    return data
  }
  const project = (host: Hostname) => {
    if (!host || !validResourceId(host.id))
      throw new DomainError(503, 'domain_provider_unavailable')
    return {
      id: host.id,
      status: String(host.status ?? 'unknown').slice(0, 64),
      ssl: String(host.ssl?.status ?? 'unknown').slice(0, 64),
    }
  }
  const ssl = {
    method: 'http',
    type: 'dv',
    settings: { min_tls_version: '1.2' },
  }
  async function routes(hostname: string) {
    const pattern = normalizeDomain(hostname) + '/*'
    for (let page = 1; page <= 10; page++) {
      const data = await request<Route[]>(
        `/workers/routes?per_page=100&page=${page}`,
      )
      if (!Array.isArray(data?.result))
        throw new DomainError(503, 'domain_provider_unavailable')
      const route = data.result.find((row) => row.pattern === pattern)
      if (route)
        return { id: id(route.id), owned: route.script === config.siteWorker }
      if (page >= (data.result_info?.total_pages ?? 1)) return null
    }
    throw new DomainError(503, 'domain_provider_unavailable')
  }
  return {
    async count() {
      const data = await request<Hostname[]>('/custom_hostnames?per_page=1')
      const count = data?.result_info?.total_count
      if (!Number.isSafeInteger(count) || count! < 0)
        throw new DomainError(503, 'domain_provider_unavailable')
      return count!
    },
    async find(hostname) {
      const host = normalizeDomain(hostname),
        data = await request<Hostname[]>(
          `/custom_hostnames?hostname=${encodeURIComponent(host)}&per_page=50`,
        )
      if (!Array.isArray(data?.result))
        throw new DomainError(503, 'domain_provider_unavailable')
      const row = data.result.find(
        (row) => row.hostname?.toLowerCase() === host,
      )
      return row ? project(row) : null
    },
    async create(hostname) {
      const data = await request<Hostname>('/custom_hostnames', 'POST', {
        hostname: normalizeDomain(hostname),
        ssl,
      })
      if (!data) throw new DomainError(503, 'domain_provider_unavailable')
      return project(data.result)
    },
    async get(hostnameId) {
      const data = await request<Hostname>(
        `/custom_hostnames/${id(hostnameId)}`,
        'GET',
        undefined,
        true,
      )
      return data ? project(data.result) : null
    },
    async retry(hostnameId) {
      await request(`/custom_hostnames/${id(hostnameId)}`, 'PATCH', { ssl })
    },
    async remove(hostnameId) {
      await request(
        `/custom_hostnames/${id(hostnameId)}`,
        'DELETE',
        undefined,
        true,
      )
    },
    findRoute: routes,
    async createRoute(hostname) {
      const data = await request<Route>('/workers/routes', 'POST', {
        pattern: normalizeDomain(hostname) + '/*',
        script: config.siteWorker,
      })
      if (!data) throw new DomainError(503, 'domain_provider_unavailable')
      return id(data.result.id)
    },
    async removeRoute(routeId, hostname) {
      const route = await routes(hostname)
      if (!route) return
      if (route.id !== routeId || !route.owned)
        throw new DomainError(409, 'domain_provider_conflict')
      await request(`/workers/routes/${id(routeId)}`, 'DELETE', undefined, true)
    },
  }
}
/** Query CNAME records without fetching user-controlled HTTP endpoints or following DNS targets. */
export async function checkDomainCname(
  host: string,
  target: string,
  transport: Transport = fetch,
): Promise<DnsState> {
  let hostname: string, expected: string
  try {
    hostname = normalizeDomain(host)
    expected = normalizeDomain(target)
  } catch {
    return 'unknown'
  }
  async function resolve(origin: string): Promise<DnsState> {
    try {
      const response = await transport(
        `${origin}?name=${encodeURIComponent(hostname)}&type=CNAME`,
        {
          headers: { accept: 'application/dns-json' },
          redirect: 'manual',
          signal: AbortSignal.timeout(6000),
        },
      )
      if (!response.ok) return 'unknown'
      const text = await response.text()
      if (text.length > 65536) return 'unknown'
      const data = JSON.parse(text) as {
        Status: number
        TC?: boolean
        Answer?: { name: string; type: number; data: string }[]
      }
      if (data.TC || ![0, 3].includes(data.Status)) return 'unknown'
      if (data.Answer && !Array.isArray(data.Answer)) return 'unknown'
      const record = data.Answer?.find(
        (row) => row.type === 5 && normalizeDomain(row.name) === hostname,
      )
      return record && normalizeDomain(record.data) === expected
        ? 'ready'
        : 'missing'
    } catch {
      return 'unknown'
    }
  }
  const answers = await Promise.all([
    resolve('https://cloudflare-dns.com/dns-query'),
    resolve('https://dns.google/resolve'),
  ])
  return answers.every((value) => value === 'ready')
    ? 'ready'
    : answers.every((value) => value === 'missing')
      ? 'missing'
      : 'unknown'
}
