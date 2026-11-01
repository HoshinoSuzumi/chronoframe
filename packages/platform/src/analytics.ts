import { PAGE_LABEL_SQL } from './analytics-pages.ts'
/** Workers Analytics Engine visit schema v1. No raw IP, query strings or full user agent. */
export type VisitScope = {
  kind: 'website' | 'portal' | 'site'
  workspaceId: number
  siteId: number
}
export type AnalyticsConfig = {
  accountId: string
  token: string
  dataset: string
}
export type AnalyticsFilter = {
  from: string
  to: string
  allTime?: boolean
  kind?: VisitScope['kind']
  workspaceId?: number
  siteId?: number
}
export type AnalyticsBucket = 'minute' | 'hour' | 'day'
/** Legacy date-only ranges include the end date; timestamp ranges are half-open. */
export function analyticsWindow(from: string, to: string) {
  const pattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/
  if (!pattern.test(from) || !pattern.test(to))
    throw new Error('invalid_analytics_range')
  const start = Date.parse(from),
    end = Date.parse(to) + (to.length === 10 ? 86400000 : 0)
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end - start > 367 * 86400000
  )
    throw new Error('invalid_analytics_range')
  if (
    new Date(start).toISOString().slice(0, 10) !== from.slice(0, 10) ||
    new Date(Date.parse(to)).toISOString().slice(0, 10) !== to.slice(0, 10)
  )
    throw new Error('invalid_analytics_range')
  const bucket: AnalyticsBucket =
    end - start <= 3600000
      ? 'minute'
      : end - start <= 2 * 86400000
        ? 'hour'
        : 'day'
  return { start, end, bucket }
}
export function analyticsFilter(
  input: Record<string, unknown>,
  now = Date.now(),
): AnalyticsFilter {
  const allTime = [true, '1', 'true'].includes(
    input.allTime as boolean | string,
  )
  const today = new Date(now).toISOString().slice(0, 10)
  const from = String(
    (!allTime ? input.from : undefined) ??
      new Date(now - 6 * 86400000).toISOString().slice(0, 10),
  )
  const to = String((!allTime ? input.to : undefined) ?? today)
  const window = analyticsWindow(from, to)
  if (
    window.start <
      Date.UTC(
        new Date(now).getUTCFullYear() - 1,
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate(),
      ) ||
    (to.length === 10 ? to > today : window.end > now + 60000)
  )
    throw new Error('invalid_analytics_range')
  const filter: AnalyticsFilter = { from, to }
  if (input.allTime !== undefined) {
    if (
      ![true, false, '1', '0', 'true', 'false'].includes(
        input.allTime as boolean | string,
      )
    )
      throw new Error('invalid_analytics_range')
    filter.allTime = [true, '1', 'true'].includes(
      input.allTime as boolean | string,
    )
  }
  if (input.kind !== undefined && input.kind !== '') {
    if (!['website', 'portal', 'site'].includes(String(input.kind)))
      throw new Error('invalid_analytics_kind')
    filter.kind = input.kind as VisitScope['kind']
  }
  for (const key of ['workspaceId', 'siteId'] as const) {
    if (input[key] === undefined || input[key] === '') continue
    const value = Number(input[key])
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error('invalid_analytics_scope')
    filter[key] = value
  }
  return filter
}
export function visitPath(raw: unknown, kind: VisitScope['kind']): string {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.length > 2048
  )
    throw new Error('invalid_visit_path')
  const path = new URL(raw, 'https://local.invalid').pathname
  if (
    path.startsWith('/api/') ||
    path.startsWith('/_nuxt/') ||
    path === '/__nuxt_error'
  )
    throw new Error('invalid_visit_path')
  // Portal paths can contain account identifiers. Only record route templates.
  if (kind === 'portal') {
    const routes = new Set([
      'workspace',
      'analytics',
      'sites',
      'account',
      'auth',
      'signin',
      'signup',
      'login',
      'register',
      'onboarding',
      'overview',
      'photos',
      'albums',
      'information',
      'domains',
      'storage',
      'settings',
      'plan',
      'security',
      'verify-email',
      'reset-password',
      'forgot-password',
    ])
    return (
      '/' +
      path
        .split('/')
        .filter(Boolean)
        .map((segment) => (routes.has(segment) ? segment : ':id'))
        .join('/')
        .slice(0, 200)
    )
  }
  return path.slice(0, 200)
}
export function visitAgent(ua: string) {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /(?:Chrome|CriOS)\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Other'
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other'
  return {
    browser,
    os,
    device: /iPad|Tablet/i.test(ua)
      ? 'Tablet'
      : /Mobile|iPhone|Android/i.test(ua)
        ? 'Mobile'
        : 'Desktop',
  }
}
export function visitReferrer(value: unknown, host: string) {
  try {
    const u = new URL(String(value))
    return ['https:', 'http:'].includes(u.protocol) && u.hostname !== host
      ? u.hostname.slice(0, 253)
      : 'Direct / internal'
  } catch {
    return 'Direct / internal'
  }
}
export async function visitorHash(
  secret: string,
  day: string,
  scope: VisitScope,
  ip: string,
  ua: string,
) {
  if (secret.length < 32) throw new Error('analytics_secret_required')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const value = JSON.stringify([
    day,
    scope.kind,
    scope.workspaceId,
    ip,
    ua.slice(0, 512),
  ])
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  )
  return Array.from(bytes.slice(0, 16), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
export function analyticsQueries(
  dataset: string,
  filter: AnalyticsFilter,
  options: { bucket?: AnalyticsBucket; limit?: number } = {},
) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(dataset))
    throw new Error('invalid_analytics_dataset')
  const window = analyticsWindow(filter.from, filter.to)
  if (options.bucket) window.bucket = options.bucket
  const limit = options.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000)
    throw new Error('invalid_analytics_limit')
  if (filter.kind && !['website', 'portal', 'site'].includes(filter.kind))
    throw new Error('invalid_analytics_filter')
  const sqlDate = (value: number) =>
    new Date(value).toISOString().slice(0, 19).replace('T', ' ')
  const terms = [
    `timestamp >= toDateTime('${sqlDate(window.start)}')`,
    `timestamp < toDateTime('${sqlDate(window.end)}')`,
    `blob1 = 'v1'`,
  ]
  if (filter.kind) terms.push(`blob2 = '${filter.kind}'`)
  for (const [key, column] of [
    ['workspaceId', 'blob3'],
    ['siteId', 'blob4'],
  ] as const) {
    const n = filter[key]
    if (n !== undefined) {
      if (!Number.isSafeInteger(n) || n < 1)
        throw new Error('invalid_analytics_scope')
      terms.push(`${column} = '${n}'`)
    }
  }
  const where = `${dataset} WHERE ${terms.join(' AND ')}`
  const metrics =
    'SUM(_sample_interval) AS pv, COUNT(DISTINCT blob7) AS uv, MAX(_sample_interval) AS sampleInterval'
  const group = (column: string) =>
    `SELECT ${column} AS label, ${metrics} FROM ${where} GROUP BY label ORDER BY pv DESC LIMIT ${limit} FORMAT JSON`
  return {
    summary: `SELECT ${metrics} FROM ${where} FORMAT JSON`,
    daily: `SELECT ${window.bucket === 'minute' ? 'toStartOfMinute(timestamp)' : window.bucket === 'hour' ? 'toStartOfHour(timestamp)' : 'toDate(timestamp)'} AS label, ${metrics} FROM ${where} GROUP BY label ORDER BY label FORMAT JSON`,
    pages: group(PAGE_LABEL_SQL),
    sources: group('blob8'),
    countries: group('blob9'),
    browsers: group('blob10'),
    devices: group('blob11'),
    systems: group('blob12'),
    campaigns: group('blob13'),
    sites: group('blob5'),
  }
}
export type AnalyticsRow = {
  page?: import('./analytics-pages.ts').AnalyticsPage
  label: string
  pv: number
  uv: number
  sampleInterval: number
}
export type AnalyticsReport = {
  archived?: boolean
  coverageStart?: string
  detailsLimited?: boolean
  archiveGap?: boolean
  bucket: AnalyticsBucket
  from: string
  to: string
  summary: AnalyticsRow
  daily: AnalyticsRow[]
  pages: AnalyticsRow[]
  sources: AnalyticsRow[]
  countries: AnalyticsRow[]
  browsers: AnalyticsRow[]
  devices: AnalyticsRow[]
  systems: AnalyticsRow[]
  campaigns: AnalyticsRow[]
  sites: AnalyticsRow[]
  notInitialized: boolean
}
const cache = new Map<string, { until: number; value: AnalyticsReport }>()
export async function queryAnalytics(
  config: AnalyticsConfig,
  filter: AnalyticsFilter,
  fetcher: typeof fetch = fetch,
  options: { bucket?: AnalyticsBucket; limit?: number } = {},
): Promise<AnalyticsReport> {
  if (!/^[a-f0-9]{32}$/.test(config.accountId) || !config.token)
    throw new Error('analytics_not_configured')
  const queries = analyticsQueries(config.dataset, filter, options)
  const cacheKey = JSON.stringify([
    config.accountId,
    config.dataset,
    filter,
    options,
  ])
  const cached = cache.get(cacheKey)
  if (cached && cached.until > Date.now()) return cached.value
  let notInitialized = false
  const result = await Promise.all(
    Object.entries(queries).map(async ([key, sql]) => {
      const response = await fetcher(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/analytics_engine/sql`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}` },
          body: sql,
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!response.ok) {
        // Before the first event the dataset does not exist. Do not mask authentication or SQL errors.
        const text = await response.text()
        if (
          response.status === 400 &&
          /(?:unknown table|table[^\n]*(?:does not exist|not found))/i.test(
            text,
          )
        ) {
          notInitialized = true
          return [key, []] as const
        }
        throw new Error('analytics_query_failed')
      }
      const json = (await response.json()) as {
        data?: Record<string, unknown>[]
      }
      if (!Array.isArray(json.data)) throw new Error('analytics_query_failed')
      const rows = json.data.map((row) => ({
        label: String(row.label ?? ''),
        pv: Number(row.pv ?? 0),
        uv: Number(row.uv ?? 0),
        sampleInterval: Number(row.sampleInterval ?? 1),
      }))
      if (
        rows.some(
          (row) =>
            !Number.isFinite(row.pv) ||
            !Number.isFinite(row.uv) ||
            !Number.isFinite(row.sampleInterval),
        )
      )
        throw new Error('analytics_query_failed')
      return [key, rows] as const
    }),
  )
  const data = Object.fromEntries(result)
  const report = {
    ...data,
    bucket: options.bucket ?? analyticsWindow(filter.from, filter.to).bucket,
    from: filter.from,
    to: filter.to,
    summary: data.summary?.[0] ?? {
      label: '',
      pv: 0,
      uv: 0,
      sampleInterval: 1,
    },
    notInitialized,
  } as AnalyticsReport
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(cacheKey, { until: Date.now() + 60000, value: report })
  return report
}
