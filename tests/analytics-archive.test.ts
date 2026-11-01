import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { splitSqlQuery } from './helpers/sql.ts'
import {
  archiveAnalytics,
  historicalAnalytics,
} from '../packages/platform/src/analytics-archive.ts'
const require = createRequire(import.meta.url)
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  require.resolve('wrangler/package.json'),
)('miniflare')
test('daily archive resumes failures, publishes complete snapshots atomically, and isolates tenants without double-counting site totals', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await mf.getD1Database('DB')
    for (const sql of splitSqlQuery(
      await readFile(
        new URL(
          '../packages/platform/migrations/0038_analytics_archive.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    ))
      await db.prepare(sql).run()
    const config = {
        accountId: 'a'.repeat(32),
        token: 'fixture',
        dataset: 'archive_fixture',
      },
      now = Date.parse('2026-11-01T12:00:00Z')
    let fail = true
    const fetcher: typeof fetch = async (_url, opts) => {
      const sql = String(opts?.body)
      if (sql.includes('MIN(timestamp)'))
        return new Response(JSON.stringify({ data: [{ day: '2026-10-28' }] }))
      if (sql.includes('AS workspaceId')) {
        if (fail && sql.includes('blob9 AS label')) {
          fail = false
          return new Response('Temporary failure', { status: 503 })
        }
        const match = sql.includes("timestamp>=toDateTime('2026-10-28")
        const label = sql.includes("'' AS label")
          ? ''
          : sql.includes('blob6 AS label')
            ? '/'
            : 'example'
        return new Response(
          JSON.stringify({
            data: match
              ? [
                  {
                    kind: 'site',
                    workspaceId: 1,
                    siteId: sql.includes("AND blob2='site'") ? 11 : 0,
                    label,
                    pv: 10,
                    uv: 3,
                    sampleInterval: 1,
                  },
                ]
              : [],
          }),
        )
      }
      const rows = sql.includes("blob3 = '2'")
        ? []
        : [
            {
              label: sql.includes('toDate(timestamp) AS label')
                ? '2026-11-01'
                : sql.includes('blob6 AS label')
                  ? '/'
                  : '',
              pv: 2,
              uv: 1,
              sampleInterval: 1,
            },
          ]
      return new Response(JSON.stringify({ data: rows }))
    }
    await assert.rejects(archiveAnalytics(db, config, now, fetcher))
    assert.equal(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM platform_analytics_archive_days')
          .first()
      ).n,
      0,
    )
    for (let i = 0; i < 8; i++)
      await archiveAnalytics(db, config, now + i, fetcher)
    assert.equal(
      (
        await db
          .prepare('SELECT cursor_day FROM platform_analytics_archive_state')
          .first()
      ).cursor_day,
      '2026-11-01',
    )
    const report = await historicalAnalytics(
      db,
      config,
      {
        from: '2025-11-01',
        to: '2026-11-01',
        allTime: true,
        kind: 'site',
        workspaceId: 1,
      },
      now,
      fetcher,
    )
    assert.equal(report.summary.pv, 12)
    assert.equal(report.summary.uv, 4)
    assert.equal(report.pages.find((row) => row.label === '/')?.pv, 12)
    assert.equal(report.bucket, 'day')
    assert.equal(report.coverageStart, '2026-10-28')
    const ownSite = await historicalAnalytics(
      db,
      config,
      {
        from: '2025-11-01',
        to: '2026-11-01',
        allTime: true,
        kind: 'site',
        workspaceId: 1,
        siteId: 11,
      },
      now,
      fetcher,
    )
    assert.equal(ownSite.summary.pv, 12)
    const other = await historicalAnalytics(
      db,
      config,
      {
        from: '2025-11-01',
        to: '2026-11-01',
        allTime: true,
        kind: 'site',
        workspaceId: 2,
      },
      now,
      fetcher,
    )
    assert.equal(other.summary.pv, 0)
    const historic = await historicalAnalytics(
      db,
      config,
      { from: '2026-10-28', to: '2026-10-28', kind: 'site', workspaceId: 1 },
      now,
      async () => {
        throw new Error('Raw data no longer available')
      },
    )
    assert.equal(historic.summary.pv, 10)
    assert.equal(historic.summary.uv, 3)
  } finally {
    await mf.dispose()
  }
})
