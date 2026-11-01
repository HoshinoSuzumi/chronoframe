import {
  analyticsQueries,
  type AnalyticsConfig,
  type AnalyticsFilter,
  type AnalyticsRow,
} from './analytics.ts'
const cache = new Map<string, { until: number; rows: AnalyticsRow[] }>()
/** Rank merged root/album photo views, paging past deleted photos only when necessary. */
export async function popularPhotos(
  config: AnalyticsConfig,
  filter: AnalyticsFilter,
  ids: string[],
  fetcher: typeof fetch = fetch,
): Promise<AnalyticsRow[]> {
  if (!/^[a-f0-9]{32}$/.test(config.accountId) || !config.token)
    throw new Error('analytics_not_configured')
  if (!filter.siteId || !filter.workspaceId || filter.kind !== 'site')
    throw new Error('invalid_analytics_scope')
  const valid = [
    ...new Set(ids.filter((id) => /^[a-f0-9-]{36}$/i.test(id))),
  ].sort()
  const key = JSON.stringify([config.accountId, config.dataset, filter, valid])
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.rows
  const base = analyticsQueries(config.dataset, filter).summary.replace(
    / FORMAT JSON$/,
    '',
  )
  const photo = 'substring(blob6, length(blob6) - 35, 36)'
  const current = new Set(valid)
  const rows: AnalyticsRow[] = []
  const pageSize = 200
  for (let offset = 0; current.size && rows.length < 5; offset += pageSize) {
    const sql =
      base.replace('SELECT ', `SELECT ${photo} AS label, `) +
      ` AND (length(blob6) = 37 OR startsWith(blob6, '/albums/')) GROUP BY label ORDER BY pv DESC, label LIMIT ${pageSize} OFFSET ${offset} FORMAT JSON`
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
      const message = await response.text()
      if (
        response.status === 400 &&
        /(?:unknown table|table[^\n]*(?:does not exist|not found))/i.test(
          message,
        )
      )
        break
      throw new Error('analytics_query_failed')
    }
    const data = (await response.json()) as { data?: Record<string, unknown>[] }
    if (!Array.isArray(data.data)) throw new Error('analytics_query_failed')
    for (const row of data.data) {
      const id = String(row.label)
      if (current.delete(id))
        rows.push({
          label: `/${id}`,
          pv: Number(row.pv ?? 0),
          uv: Number(row.uv ?? 0),
          sampleInterval: Number(row.sampleInterval ?? 1),
        })
    }
    if (data.data.length < pageSize) break
  }

  if (
    rows.some(
      (row) =>
        !Number.isFinite(row.pv) ||
        !Number.isFinite(row.uv) ||
        !Number.isFinite(row.sampleInterval),
    )
  )
    throw new Error('analytics_query_failed')
  rows.sort((a, b) => b.pv - a.pv || a.label.localeCompare(b.label))
  const result = rows.slice(0, 5)
  if (cache.size > 100) cache.clear()
  cache.set(key, { until: Date.now() + 60000, rows: result })
  return result
}
