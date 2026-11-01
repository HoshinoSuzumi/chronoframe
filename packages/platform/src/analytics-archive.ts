import type { PlatformD1 } from './index.ts'
import { allRows } from './subscriptions.ts'
import {
  analyticsWindow,
  queryAnalytics,
  type AnalyticsConfig,
  type AnalyticsFilter,
  type AnalyticsReport,
  type AnalyticsRow,
} from './analytics.ts'
const DAY = 86400000,
  PAGE = 250
const dimensions = [
  ['summary', "''"],
  ['pages', 'blob6'],
  ['sources', 'blob8'],
  ['countries', 'blob9'],
  ['browsers', 'blob10'],
  ['devices', 'blob11'],
  ['systems', 'blob12'],
  ['campaigns', 'blob13'],
  ['sites', 'blob5'],
] as const
const phases = dimensions.length * 2
const isoDay = (now: number) => new Date(now).toISOString().slice(0, 10)
function configuration(config: AnalyticsConfig) {
  if (
    !/^[a-f0-9]{32}$/.test(config.accountId) ||
    !config.token ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(config.dataset)
  )
    throw new Error('analytics_not_configured')
}
async function sqlRows(
  config: AnalyticsConfig,
  sql: string,
  fetcher: typeof fetch,
) {
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
    const text = await response.text()
    if (
      response.status === 400 &&
      /(?:unknown table|table[^\n]*(?:does not exist|not found))/i.test(text)
    )
      throw new Error('analytics_dataset_missing')
    throw new Error('analytics_archive_query_failed')
  }
  const result = (await response.json()) as { data?: Record<string, unknown>[] }
  if (!Array.isArray(result.data))
    throw new Error('analytics_archive_query_failed')
  return result.data
}
export async function firstAnalyticsDay(
  config: AnalyticsConfig,
  fetcher: typeof fetch = fetch,
) {
  configuration(config)
  let rows: Record<string, unknown>[]
  try {
    rows = await sqlRows(
      config,
      `SELECT toDate(MIN(timestamp)) AS day FROM ${config.dataset} WHERE blob1='v1' FORMAT JSON`,
      fetcher,
    )
  } catch (e) {
    if (e instanceof Error && e.message === 'analytics_dataset_missing')
      return null
    throw e
  }
  const day = String(rows[0]?.day ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '2020-01-01' ? day : null
}
/** Incremental, leased archive. Publish a day atomically only after every dimension/page completes. */
export async function archiveAnalytics(
  db: PlatformD1,
  config: AnalyticsConfig,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
) {
  configuration(config)
  const today = isoDay(now),
    token = crypto.randomUUID()
  let state = await db
    .prepare('SELECT * FROM platform_analytics_archive_state WHERE dataset=?')
    .bind(config.dataset)
    .first<any>()
  if (
    state &&
    (state.cursor_day >= today ||
      (state.cursor_day === isoDay(Date.parse(today) - DAY) &&
        now < Date.parse(today) + 2 * 3600000))
  )
    return
  if (!state) {
    const first = await firstAnalyticsDay(config, fetcher)
    if (!first) return
    await db
      .prepare(
        'INSERT OR IGNORE INTO platform_analytics_archive_state(dataset,start_day,cursor_day,snapshot) VALUES(?,?,?,?)',
      )
      .bind(config.dataset, first, first, crypto.randomUUID())
      .run()
  }
  const claimed = await db
    .prepare(
      'UPDATE platform_analytics_archive_state SET lease_token=?,lease_until=? WHERE dataset=? AND lease_until<?',
    )
    .bind(token, now + 300000, config.dataset, now)
    .run()
  if (!claimed.meta.changes) return
  try {
    for (let step = 0; step < 12; step++) {
      state = await db
        .prepare(
          'SELECT * FROM platform_analytics_archive_state WHERE dataset=? AND lease_token=?',
        )
        .bind(config.dataset, token)
        .first<any>()
      if (!state || state.cursor_day >= today) return
      if (state.cursor_day < isoDay(now - 93 * DAY))
        throw new Error('analytics_archive_retention_gap')
      // Allow Analytics Engine ingestion to settle before finalizing yesterday.
      if (
        state.cursor_day === isoDay(Date.parse(today) - DAY) &&
        now < Date.parse(today) + 2 * 3600000
      )
        return
      if (state.phase >= phases) {
        const next = isoDay(Date.parse(state.cursor_day) + DAY)
        await db.batch([
          db
            .prepare(
              'INSERT INTO platform_analytics_archive_days(dataset,day,snapshot,completed_at) SELECT dataset,cursor_day,snapshot,? FROM platform_analytics_archive_state WHERE dataset=? AND lease_token=? ON CONFLICT(dataset,day) DO UPDATE SET snapshot=excluded.snapshot,completed_at=excluded.completed_at',
            )
            .bind(now, config.dataset, token),
          db
            .prepare(
              'DELETE FROM platform_analytics_archive_rows WHERE dataset=? AND day=? AND snapshot<>? AND EXISTS(SELECT 1 FROM platform_analytics_archive_state WHERE dataset=? AND lease_token=?)',
            )
            .bind(
              config.dataset,
              state.cursor_day,
              state.snapshot,
              config.dataset,
              token,
            ),
          db
            .prepare(
              'UPDATE platform_analytics_archive_state SET cursor_day=?,snapshot=?,phase=0,page_offset=0,updated_at=? WHERE dataset=? AND lease_token=?',
            )
            .bind(next, crypto.randomUUID(), now, config.dataset, token),
        ])
        continue
      }
      const [dimension, column] = dimensions[Math.floor(state.phase / 2)]!
      const perSite = state.phase % 2 === 1
      const end = isoDay(Date.parse(state.cursor_day) + DAY)
      const sql = `SELECT blob2 AS kind,blob3 AS workspaceId,${perSite ? 'blob4' : "'0'"} AS siteId,${column} AS label,SUM(_sample_interval) AS pv,COUNT(DISTINCT blob7) AS uv,MAX(_sample_interval) AS sampleInterval FROM ${config.dataset} WHERE blob1='v1' AND timestamp>=toDateTime('${state.cursor_day} 00:00:00') AND timestamp<toDateTime('${end} 00:00:00')${perSite ? " AND blob2='site'" : ''} GROUP BY kind,workspaceId,siteId,label ORDER BY kind,workspaceId,siteId,label LIMIT ${PAGE} OFFSET ${state.page_offset} FORMAT JSON`
      const rows = await sqlRows(config, sql, fetcher)
      if (
        rows.some(
          (row) =>
            !['website', 'portal', 'site'].includes(String(row.kind)) ||
            !Number.isSafeInteger(Number(row.workspaceId)) ||
            Number(row.workspaceId) < 0 ||
            !Number.isSafeInteger(Number(row.siteId)) ||
            Number(row.siteId) < 0 ||
            !Number.isFinite(Number(row.pv)) ||
            !Number.isFinite(Number(row.uv)) ||
            !Number.isFinite(Number(row.sampleInterval)),
        )
      )
        throw new Error('invalid_analytics_archive_rows')
      await db.batch([
        db
          .prepare(
            `INSERT INTO platform_analytics_archive_rows(dataset,snapshot,day,kind,workspace_id,site_id,dimension,label,pv,uv,sample_interval) SELECT ?,?,?,json_extract(value,'$.kind'),CAST(json_extract(value,'$.workspaceId') AS INTEGER),CAST(json_extract(value,'$.siteId') AS INTEGER),?,COALESCE(json_extract(value,'$.label'),''),json_extract(value,'$.pv'),json_extract(value,'$.uv'),json_extract(value,'$.sampleInterval') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM platform_analytics_archive_state WHERE dataset=? AND lease_token=?) ON CONFLICT(dataset,snapshot,kind,workspace_id,site_id,dimension,label) DO UPDATE SET pv=excluded.pv,uv=excluded.uv,sample_interval=excluded.sample_interval`,
          )
          .bind(
            config.dataset,
            state.snapshot,
            state.cursor_day,
            dimension,
            JSON.stringify(rows),
            config.dataset,
            token,
          ),
        db
          .prepare(
            'UPDATE platform_analytics_archive_state SET phase=?,page_offset=?,updated_at=? WHERE dataset=? AND lease_token=?',
          )
          .bind(
            rows.length === PAGE ? state.phase : state.phase + 1,
            rows.length === PAGE ? state.page_offset + PAGE : 0,
            now,
            config.dataset,
            token,
          ),
      ])
    }
  } finally {
    await db
      .prepare(
        'UPDATE platform_analytics_archive_state SET lease_until=0,lease_token=NULL WHERE dataset=? AND lease_token=?',
      )
      .bind(config.dataset, token)
      .run()
  }
}
export async function historicalAnalytics(
  db: PlatformD1,
  config: AnalyticsConfig,
  filter: AnalyticsFilter,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<AnalyticsReport> {
  configuration(config)
  const state = await db
    .prepare('SELECT * FROM platform_analytics_archive_state WHERE dataset=?')
    .bind(config.dataset)
    .first<any>()
  const first =
    state?.start_day ??
    (await firstAnalyticsDay(config, fetcher)) ??
    isoDay(now)
  const start = filter.allTime
    ? first
    : isoDay(analyticsWindow(filter.from, filter.to).start)
  const end = filter.allTime
    ? isoDay(now)
    : isoDay(analyticsWindow(filter.from, filter.to).end - 1)
  const from = start < first ? first : start
  const cutoff = state?.cursor_day ?? first
  const values: (string | number)[] = [config.dataset, from, end, cutoff]
  let scope = 'r.dataset=? AND r.day>=? AND r.day<=? AND r.day<?'
  if (filter.kind) {
    scope += ' AND r.kind=?'
    values.push(filter.kind)
  }
  if (filter.workspaceId) {
    scope += ' AND r.workspace_id=?'
    values.push(filter.workspaceId)
  }
  scope += ' AND r.site_id=?'
  values.push(filter.siteId ?? 0)
  let raw: AnalyticsReport | null = null
  if (end >= cutoff && from <= end)
    raw = await queryAnalytics(
      config,
      {
        ...filter,
        allTime: false,
        from: [from, cutoff, isoDay(now - 93 * DAY)].sort().at(-1)!,
        to: end,
      },
      fetcher,
      { bucket: 'day', limit: 5000 },
    )
  const source = `FROM platform_analytics_archive_rows r JOIN platform_analytics_archive_days d ON d.dataset=r.dataset AND d.day=r.day AND d.snapshot=r.snapshot WHERE ${scope}`
  const result = await Promise.all(
    dimensions.map(async ([dimension]) => {
      const live =
        dimension === 'summary'
          ? raw
            ? [{ ...raw.summary, label: '' }]
            : []
          : (raw?.[dimension] ?? [])
      const rows = await allRows<AnalyticsRow>(
        db
          .prepare(
            `WITH combined AS (SELECT r.label AS label,SUM(r.pv) AS pv,SUM(r.uv) AS uv,MAX(r.sample_interval) AS sampleInterval ${source} AND r.dimension=? GROUP BY r.label UNION ALL SELECT json_extract(value,'$.label'),json_extract(value,'$.pv'),json_extract(value,'$.uv'),json_extract(value,'$.sampleInterval') FROM json_each(?)) SELECT label,SUM(pv) AS pv,SUM(uv) AS uv,MAX(sampleInterval) AS sampleInterval FROM combined GROUP BY label ORDER BY pv DESC,label LIMIT 20`,
          )
          .bind(...values, dimension, JSON.stringify(live)),
      )
      return [dimension, rows] as const
    }),
  )
  const data = Object.fromEntries(result)
  const daily = await allRows<AnalyticsRow>(
    db
      .prepare(
        `WITH combined AS (SELECT r.day AS label,SUM(r.pv) AS pv,SUM(r.uv) AS uv,MAX(r.sample_interval) AS sampleInterval ${source} AND r.dimension='summary' GROUP BY r.day UNION ALL SELECT json_extract(value,'$.label'),json_extract(value,'$.pv'),json_extract(value,'$.uv'),json_extract(value,'$.sampleInterval') FROM json_each(?)) SELECT label,SUM(pv) AS pv,SUM(uv) AS uv,MAX(sampleInterval) AS sampleInterval FROM combined GROUP BY label ORDER BY label`,
      )
      .bind(...values, JSON.stringify(raw?.daily ?? [])),
  )
  return {
    ...data,
    from,
    to: end,
    bucket: 'day',
    daily,
    summary: data.summary?.[0] ?? {
      label: '',
      pv: 0,
      uv: 0,
      sampleInterval: 1,
    },
    notInitialized: !data.summary?.[0]?.pv && (raw?.notInitialized ?? false),
    archived: true,
    coverageStart: first,
    archiveGap: cutoff < isoDay(now - 89 * DAY),
    detailsLimited:
      !!raw &&
      dimensions.some(([d]) => d !== 'summary' && raw![d].length >= 5000),
  } as AnalyticsReport
}
