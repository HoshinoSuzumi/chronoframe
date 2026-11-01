import {
  analyticsQueries,
  type AnalyticsConfig,
  type AnalyticsFilter,
  type AnalyticsRow,
} from './analytics.ts'
const cache = new Map<string, { until: number; rows: AnalyticsRow[] }>()
/** Query every current photo, merging root and album views before ranking. Each chunk's top five suffices for the global top five. */
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
  const chunks: string[][] = []
  for (let i = 0; i < valid.length; i += 100)
    chunks.push(valid.slice(i, i + 100))
  const rows: AnalyticsRow[] = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(4, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++]!
        const sql =
          base.replace('SELECT ', `SELECT ${photo} AS label, `) +
          ` AND (length(blob6) = 37 OR startsWith(blob6, '/albums/')) AND ${photo} IN (${chunk.map((id) => `'${id}'`).join(',')}) GROUP BY label ORDER BY pv DESC, label LIMIT 5 FORMAT JSON`
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
            continue
          throw new Error('analytics_query_failed')
        }
        const data = (await response.json()) as {
          data?: Record<string, unknown>[]
        }
        if (!Array.isArray(data.data)) throw new Error('analytics_query_failed')
        for (const row of data.data)
          if (chunk.includes(String(row.label)))
            rows.push({
              label: `/${row.label}`,
              pv: Number(row.pv) || 0,
              uv: Number(row.uv) || 0,
              sampleInterval: Number(row.sampleInterval) || 1,
            })
      }
    }),
  )
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
