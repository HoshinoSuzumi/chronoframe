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
  kind?: VisitScope['kind']
  workspaceId?: number
  siteId?: number
}
export function analyticsFilter(
  input: Record<string, unknown>,
  now = Date.now(),
): AnalyticsFilter {
  const today = new Date(now).toISOString().slice(0, 10)
  const from = String(
    input.from ?? new Date(now - 6 * 86400000).toISOString().slice(0, 10),
  )
  const to = String(input.to ?? today)
  const date = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(s).toISOString().slice(0, 10) === s
  if (
    !date(from) ||
    !date(to) ||
    from > to ||
    to > today ||
    Date.parse(to) - Date.parse(from) > 30 * 86400000 ||
    Date.parse(from) < Date.parse(today) - 89 * 86400000
  )
    throw new Error('invalid_analytics_range')
  const filter: AnalyticsFilter = { from, to }
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
export function analyticsQueries(dataset: string, filter: AnalyticsFilter) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(dataset))
    throw new Error('invalid_analytics_dataset')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(filter.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(filter.to) ||
    (filter.kind && !['website', 'portal', 'site'].includes(filter.kind))
  )
    throw new Error('invalid_analytics_filter')
  const terms = [
    `timestamp >= toDateTime('${filter.from} 00:00:00')`,
    `timestamp < toDateTime('${new Date(Date.parse(filter.to) + 86400000).toISOString().slice(0, 10)} 00:00:00')`,
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
    `SELECT ${column} AS label, ${metrics} FROM ${where} GROUP BY label ORDER BY pv DESC LIMIT 20 FORMAT JSON`
  return {
    summary: `SELECT ${metrics} FROM ${where} FORMAT JSON`,
    daily: `SELECT toDate(timestamp) AS label, ${metrics} FROM ${where} GROUP BY label ORDER BY label FORMAT JSON`,
    pages: group('blob6'),
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
  label: string
  pv: number
  uv: number
  sampleInterval: number
}
export type AnalyticsReport = {
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
): Promise<AnalyticsReport> {
  if (!/^[a-f0-9]{32}$/.test(config.accountId) || !config.token)
    throw new Error('analytics_not_configured')
  const queries = analyticsQueries(config.dataset, filter)
  const cacheKey = JSON.stringify([config.accountId, config.dataset, filter])
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
