import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { splitSqlQuery } from './helpers/sql.ts'
import {
  archiveAnalytics,
  historicalAnalytics,
} from '../packages/platform/src/analytics-archive.ts'
import { archiveRange } from '../packages/saas-ui/app/utils/analytics-range.ts'
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
    let pageSql = ''
    const fetcher: typeof fetch = async (_url, opts) => {
      const sql = String(opts?.body)
      if (sql.includes('MIN(timestamp)'))
        return new Response(JSON.stringify({ data: [{ day: '2026-10-28' }] }))
      if (sql.includes('AS workspaceId')) {
        if (sql.includes("format('{}|{}|{}',blob4,blob5,blob6) AS label"))
          pageSql = sql
        if (fail && sql.includes('blob9 AS label')) {
          fail = false
          return new Response('Temporary failure', { status: 503 })
        }
        const match = sql.includes("timestamp>=toDateTime('2026-10-28")
        const label = sql.includes("'' AS label")
          ? ''
          : sql.includes("format('{}|{}|{}',blob4,blob5,blob6) AS label")
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
                : sql.includes("format('{}|{}|{}',blob4,blob5,blob6) AS label")
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
        from: '2025-11-01T12:00:00Z',
        to: '2026-11-01T12:00:00Z',
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
    const longRange = archiveRange({
      from: '2026-08-01T12:00:00.000Z',
      to: '2026-10-29T00:00:00.000Z',
    })
    const longReport = await historicalAnalytics(
      db,
      config,
      { ...longRange, kind: 'site', workspaceId: 1 },
      now,
      fetcher,
    )
    assert.equal(longReport.to, '2026-10-28')
    assert.equal(longReport.summary.pv, 10)
    assert.match(
      pageSql,
      /ORDER BY kind,workspaceId,siteId,label LIMIT 250 OFFSET \d+ FORMAT JSON$/,
    )
    assert.doesNotMatch(pageSql, /FROM \(/)
  } finally {
    await mf.dispose()
  }
})

test('historical timestamp bounds are rejected before archive or live queries', async () => {
  const db = {
    prepare: () => {
      throw new Error('archive queried')
    },
  } as any
  const config = {
    accountId: 'a'.repeat(32),
    token: 'fixture',
    dataset: 'archive_fixture',
  }
  const fetcher: typeof fetch = async () => {
    throw new Error('live queried')
  }
  for (const [from, to] of [
    ['2026-10-01T12:00:00Z', '2026-10-02'],
    ['2026-10-01', '2026-10-02T00:00:00Z'],
  ])
    await assert.rejects(
      historicalAnalytics(
        db,
        config,
        { from: from!, to: to! },
        Date.now(),
        fetcher,
      ),
      { message: 'analytics_range_precision_unavailable' },
    )
})

test('archive pages keep the top labels independently per workspace and site', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-26',
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ['DB'],
    }),
  )
  const sqlite = new DatabaseSync(':memory:')
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
    await db
      .prepare(
        "INSERT INTO platform_analytics_archive_state(dataset,start_day,cursor_day,snapshot,phase) VALUES('archive_fixture','2026-10-28','2026-10-28','snapshot',3)",
      )
      .run()
    sqlite.function('toDateTime', (value) => value)
    sqlite.exec(
      'CREATE TABLE archive_fixture (blob1, blob2, blob3, blob4, blob6, blob7, timestamp, _sample_interval)',
    )
    const insert = sqlite.prepare(
      'INSERT INTO archive_fixture VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (let i = 0; i < 5001; i++)
      insert.run(
        'v1',
        'site',
        '1',
        '11',
        `label-${String(i).padStart(4, '0')}`,
        `visitor-${i}`,
        '2026-10-28 12:00:00',
        i === 5000 ? 10 : 1,
      )
    insert.run(
      'v1',
      'site',
      '1',
      '12',
      'other-site',
      'visitor-b',
      '2026-10-28 12:00:00',
      1,
    )
    insert.run(
      'v1',
      'site',
      '2',
      '21',
      'other-workspace',
      'visitor-c',
      '2026-10-28 12:00:00',
      1,
    )
    sqlite.exec(
      "ALTER TABLE archive_fixture ADD COLUMN blob5 TEXT DEFAULT 'site.example'",
    )
    sqlite.function('format', { varargs: true }, (pattern, ...values) => {
      let i = 0
      return String(pattern).replace(/\{\}/g, () => String(values[i++]))
    })
    const offsets: number[] = []
    const fetcher: typeof fetch = async (_url, opts) => {
      const sql = String(opts?.body)
      if (!sql.includes("format('{}|{}|{}',blob4,blob5,blob6) AS label"))
        return Response.json({ data: [] })
      assert.doesNotMatch(sql, /FROM \(/)
      offsets.push(Number(/OFFSET (\d+)/.exec(sql)![1]))
      return Response.json({
        data: sqlite.prepare(sql.replace(' FORMAT JSON', '')).all(),
      })
    }
    const config = {
      accountId: 'a'.repeat(32),
      token: 'fixture',
      dataset: 'archive_fixture',
    }
    const now = Date.parse('2026-10-29T12:00:00Z')
    for (let i = 0; i < 5; i++)
      await archiveAnalytics(db, config, now + i, fetcher)
    assert.deepEqual(
      offsets,
      Array.from({ length: 21 }, (_, i) => i * 250),
    )
    const rows = (
      await db
        .prepare(
          "SELECT workspace_id,site_id,label FROM platform_analytics_archive_rows WHERE dimension='pages' ORDER BY workspace_id,site_id,label",
        )
        .all()
    ).results as any[]
    assert.equal(rows.length, 5002)
    assert.ok(rows.some((r) => r.label.endsWith('|label-5000')))
    assert.ok(!rows.some((r) => r.label.endsWith('|label-4999')))
    assert.ok(
      rows.some(
        (r) =>
          r.workspace_id === 1 &&
          r.site_id === 12 &&
          r.label.endsWith('|other-site'),
      ),
    )
    assert.ok(
      rows.some(
        (r) =>
          r.workspace_id === 2 &&
          r.site_id === 21 &&
          r.label.endsWith('|other-workspace'),
      ),
    )
    await db
      .prepare(
        "UPDATE platform_analytics_archive_state SET cursor_day='2026-10-28',snapshot='workspace',phase=2,page_offset=0",
      )
      .run()
    offsets.length = 0
    for (let i = 0; i < 5; i++)
      await archiveAnalytics(db, config, now + i, fetcher)
    assert.deepEqual(
      offsets,
      Array.from({ length: 42 }, (_, i) => (i % 21) * 250),
    )
    const workspaceRows = (
      await db
        .prepare(
          "SELECT workspace_id,site_id,label FROM platform_analytics_archive_rows WHERE snapshot='workspace' AND dimension='pages' AND site_id=0",
        )
        .all()
    ).results as any[]
    assert.equal(workspaceRows.length, 5001)
    assert.equal(workspaceRows.filter((r) => r.workspace_id === 1).length, 5000)
    assert.ok(workspaceRows.some((r) => r.label.endsWith('|label-5000')))
    assert.ok(
      workspaceRows.some(
        (r) =>
          r.workspace_id === 2 &&
          r.site_id === 0 &&
          r.label.endsWith('|other-workspace'),
      ),
    )
  } finally {
    sqlite.close()
    await mf.dispose()
  }
})

test('migration restarts unfinished snapshots without deleting published archive rows', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(
      await readFile(
        new URL(
          '../packages/platform/migrations/0038_analytics_archive.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    db.exec(`INSERT INTO platform_analytics_archive_state(dataset,start_day,cursor_day,snapshot,phase,page_offset,lease_token,lease_until) VALUES('fixture','2026-10-27','2026-10-28','pending',3,250,'lease',123);
      INSERT INTO platform_analytics_archive_days VALUES('fixture','2026-10-27','published',1);
      INSERT INTO platform_analytics_archive_rows VALUES('fixture','published','2026-10-27','site',1,0,'pages','old',1,1,1),('fixture','pending','2026-10-28','site',1,0,'pages','partial',1,1,1);`)
    db.exec(
      await readFile(
        new URL(
          '../packages/platform/migrations/0039_restart_analytics_archive.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    assert.deepEqual(
      {
        ...db
          .prepare(
            'SELECT phase,page_offset,lease_token,lease_until FROM platform_analytics_archive_state',
          )
          .get(),
      },
      { phase: 0, page_offset: 0, lease_token: null, lease_until: 0 },
    )
    assert.deepEqual(
      db
        .prepare('SELECT label FROM platform_analytics_archive_rows')
        .all()
        .map((r) => r.label),
      ['old'],
    )
  } finally {
    db.close()
  }
})
