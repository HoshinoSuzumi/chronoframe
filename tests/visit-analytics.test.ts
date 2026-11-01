import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  analyticsFilter,
  analyticsWindow,
  analyticsQueries,
  visitPath,
  visitReferrer,
  visitAgent,
  visitorHash,
  queryAnalytics,
} from '../packages/platform/src/analytics.ts'
import {
  FREE_LIMITS,
  validatePolicy,
} from '../packages/platform/src/entitlements.ts'
import { configureAnalyticsDeployment } from '../scripts/analytics-deployment.mjs'
import { archiveRange } from '../packages/saas-ui/app/utils/analytics-range.ts'
const require = createRequire(import.meta.url),
  ts = require('typescript')
async function module(file: string, deps: Record<string, unknown>) {
  const source = (
    await readFile(new URL(file, import.meta.url), 'utf8')
  ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  return new Function(
    'exports',
    ...Object.keys(deps),
    code + ';return exports',
  )({}, ...Object.values(deps))
}
test('daily identities are deterministic, isolated by workspace/day, and do not retain request secrets', async () => {
  const scope = { kind: 'site' as const, workspaceId: 1, siteId: 2 }
  const hash = await visitorHash(
    'a'.repeat(64),
    '2026-11-01',
    scope,
    '203.0.113.1',
    'browser',
  )
  assert.equal(hash.length, 32)
  assert.equal(
    hash,
    await visitorHash(
      'a'.repeat(64),
      '2026-11-01',
      { ...scope, siteId: 3 },
      '203.0.113.1',
      'browser',
    ),
  )
  assert.notEqual(
    hash,
    await visitorHash(
      'a'.repeat(64),
      '2026-11-02',
      scope,
      '203.0.113.1',
      'browser',
    ),
  )
  assert.notEqual(
    hash,
    await visitorHash(
      'a'.repeat(64),
      '2026-11-01',
      { ...scope, workspaceId: 2 },
      '203.0.113.1',
      'browser',
    ),
  )
  await assert.rejects(visitorHash('short', '2026-11-01', scope, '', ''))
  assert.equal(
    visitPath(
      '/account/reset-password/secret_token?email=user@example.com',
      'portal',
    ),
    '/account/reset-password/:id',
  )
  assert.equal(visitPath('/sites/21/photos', 'portal'), '/sites/:id/photos')
  assert.equal(
    visitPath('/photos/a?email=private@example.com', 'site'),
    '/photos/a',
  )
  assert.throws(() => visitPath('/api/public/photos', 'site'))
  assert.equal(
    visitReferrer('https://search.example/path?private=1', 'gallery.example'),
    'search.example',
  )
  assert.equal(
    visitReferrer('javascript:alert(1)', 'gallery.example'),
    'Direct / internal',
  )
  assert.equal(visitAgent('Mozilla iPhone Mobile Safari/600').device, 'Mobile')
})
test('analytics filters reject SQL injection and unbounded queries; every query carries tenant constraints', () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const filter = analyticsFilter(
    { workspaceId: '7', siteId: '4', kind: 'site' },
    now,
  )
  const queries = analyticsQueries('chronoframe_visits', filter)
  for (const sql of Object.values(queries)) {
    assert.match(sql, /blob3 = '7'/)
    assert.match(sql, /blob4 = '4'/)
    assert.match(sql, /blob2 = 'site'/)
    assert.match(sql, /SUM\(_sample_interval\)/)
  }
  for (const input of [
    { from: "2026-11-01' OR 1=1" },
    { from: '2025-01-01' },
    { to: '2026-11-02' },
    { workspaceId: '1 OR 1=1' },
    { siteId: '-1' },
    { kind: 'other' },
  ])
    assert.throws(() => analyticsFilter(input, now))
  assert.throws(() => analyticsQueries('table; DROP TABLE users', filter))
  assert.throws(() =>
    analyticsQueries('chronoframe_visits', {
      ...filter,
      from: "' UNION SELECT",
    }),
  )
  assert.equal(
    validatePolicy({ limits: FREE_LIMITS, rules: [] }).analytics,
    undefined,
  )
  assert.equal(
    validatePolicy({ limits: FREE_LIMITS, rules: [], analytics: true })
      .analytics,
    true,
  )
  assert.throws(() =>
    validatePolicy({ limits: FREE_LIMITS, rules: [], analytics: 1 }),
  )
})
test('collector binds tenant identity to the verified host, respects opt-outs and excludes sensitive request fields', async () => {
  const points: any[] = []
  let headers: Record<string, string> = {
    origin: 'https://gallery.example',
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.2',
    'user-agent': 'Mozilla Chrome/100',
  }
  let body: any = {
    path: '/?email=user@example.com',
    workspaceId: 999,
    siteId: 999,
    referrer: 'https://search.example/?private=yes',
    campaign: 'Launch',
  }
  const { collectVisit } = await module('../apps/shared/analytics/collect.ts', {
    createError: (value: any) => Object.assign(new Error(), value),
    getHeader: (_: any, key: string) => headers[key],
    getRequestWebStream: () => null,
    setResponseStatus: () => {},
    setResponseHeader: () => {},
    readSiteBody: async () => body,
    platformRequestURL: () =>
      new URL('https://gallery.example/api/analytics/visit'),
    publicSiteContext: async () => ({ site: { id: 5, workspaceId: 3 } }),
    visitAgent,
    visitPath,
    visitReferrer,
    visitorHash,
  })
  const event = {
    method: 'POST',
    context: {
      cloudflare: {
        env: {
          VISIT_ANALYTICS: { writeDataPoint: (p: any) => points.push(p) },
        },
        request: { cf: { country: 'HK' } },
      },
    },
  }
  await collectVisit(event, 'site', 'a'.repeat(64))
  assert.equal(points.length, 1)
  assert.equal(points[0].indexes[0], 'site:3:5')
  const serialized = JSON.stringify(points)
  assert.ok(!serialized.includes('203.0.113.2'))
  assert.ok(!serialized.includes('private=yes'))
  assert.ok(!serialized.includes('user@example.com'))
  assert.ok(!serialized.includes('Mozilla'))
  for (const header of ['dnt', 'sec-gpc']) {
    headers[header] = '1'
    await collectVisit(event, 'site', 'a'.repeat(64))
    delete headers[header]
  }
  assert.equal(points.length, 1)
  headers.origin = 'https://evil.example'
  await assert.rejects(collectVisit(event, 'site', 'a'.repeat(64)), {
    statusCode: 403,
  })
})
test('portal report checks membership, live entitlement and selected-site ownership before executing any SQL API query', async () => {
  let membership = true,
    entitled = false,
    siteOwned = true,
    reports = 0
  let query: any = { workspaceId: '7', siteId: '3', kind: 'website' }
  const db = {
    prepare: (sql: string) => ({
      bind: (..._args: any[]) => ({
        first: async () =>
          sql.includes('memberships')
            ? membership
              ? { workspace_id: 7 }
              : null
            : siteOwned
              ? { id: 3 }
              : null,
      }),
    }),
  }
  const deps = {
    definePlatformHandler: (f: any) => f,
    getQuery: () => query,
    createError: (value: any) => Object.assign(new Error(), value),
    setResponseHeader: () => {},
    requirePlatformSession: async () => ({ userId: 1 }),
    useRuntimeConfig: () => ({ platform: {} }),
    platformDatabase: () => db,
    workspaceEntitlements: async () => ({ analytics: entitled }),
    analyticsFilter,
    analyticsReport: async (_: any, f: any) => {
      reports++
      return f
    },
  }
  const { default: report } = await module(
    '../apps/cloud/server/api/analytics/report.get.ts',
    deps,
  )
  await assert.rejects(report({}), { statusCode: 403 })
  assert.equal(reports, 0)
  entitled = true
  membership = false
  await assert.rejects(report({}), { statusCode: 404 })
  assert.equal(reports, 0)
  membership = true
  siteOwned = false
  await assert.rejects(report({}), { statusCode: 404 })
  assert.equal(reports, 0)
  siteOwned = true
  const filter = await report({})
  assert.equal(filter.kind, 'site')
  assert.equal(filter.workspaceId, 7)
  assert.equal(filter.siteId, 3)
  entitled = false
  await assert.rejects(report({}), { statusCode: 403 })
  assert.equal(reports, 1)
})
test('archive routing sends UTC dates even when a short range crosses the cutoff in transit', async () => {
  const now = Date.now()
  const range = {
    from: new Date(now - 89 * 86400000 - 60000).toISOString(),
    to: new Date(now - 88 * 86400000).toISOString(),
    workspaceId: 7,
  }
  const sent = archiveRange(range, now - 120000)
  assert.deepEqual(sent, range)
  const { analyticsReport } = await module(
    '../apps/shared/analytics/query.ts',
    {
      analyticsWindow,
      platformDatabase: () => ({}),
      historicalAnalytics: async (
        _db: unknown,
        _config: unknown,
        filter: unknown,
      ) => filter,
      queryAnalytics: async (_config: unknown, filter: unknown) => filter,
      createError: (value: any) => Object.assign(new Error(), value),
    },
  )
  const event = { context: { cloudflare: { env: {} } } }
  assert.deepEqual(await analyticsReport(event, sent), {
    ...range,
    from: new Date(Date.parse(range.from)).toISOString().slice(0, 10),
    to: new Date(Date.parse(range.to) - 1).toISOString().slice(0, 10),
  })
  const dates = { from: '2025-01-01', to: '2025-01-02', workspaceId: 7 }
  assert.deepEqual(await analyticsReport(event, dates), dates)
  const recent = {
    from: new Date(now - 3600000).toISOString(),
    to: new Date(now).toISOString(),
  }
  assert.deepEqual(await analyticsReport(event, recent), recent)
  const allTime = { ...recent, allTime: true }
  assert.deepEqual(await analyticsReport(event, allTime), {
    ...allTime,
    from: new Date(Date.parse(allTime.from)).toISOString().slice(0, 10),
    to: new Date(Date.parse(allTime.to) - 1).toISOString().slice(0, 10),
  })
})
test('SQL API failures are not empty reports; sampled results preserve weighted PV and observed UV', async () => {
  const accountId = 'a'.repeat(32),
    filter = analyticsFilter({ workspaceId: 91, kind: 'site' })
  let calls = 0
  const report = await queryAnalytics(
    { accountId, dataset: 'fixture_visits', token: 'fixture-secret' },
    filter,
    async (_url, options) => {
      calls++
      assert.match(String(options?.body), /blob3 = '91'/)
      return new Response(
        JSON.stringify({
          data: [{ pv: 120, uv: 12, sampleInterval: 10, label: 'test' }],
        }),
        { status: 200 },
      )
    },
  )
  assert.equal(report.summary.pv, 120)
  assert.equal(report.summary.uv, 12)
  assert.equal(report.summary.sampleInterval, 10)
  assert.equal(calls, 10)
  await assert.rejects(
    queryAnalytics(
      { accountId, dataset: 'fixture_error', token: 'fixture-secret' },
      filter,
      async () => new Response('Unauthorized', { status: 403 }),
    ),
  )
  const empty = await queryAnalytics(
    { accountId, dataset: 'fixture_missing', token: 'fixture-secret' },
    filter,
    async () => new Response('Unknown table fixture_missing', { status: 400 }),
  )
  assert.equal(empty.notInitialized, true)
  assert.equal(empty.summary.pv, 0)
})
test('production and preview bindings are isolated and only enable with both secrets', () => {
  const env = {
    ANALYTICS_ACCOUNT_ID: 'a'.repeat(32),
    ANALYTICS_API_TOKEN: 'test',
    ANALYTICS_VISITOR_SECRET: 'b'.repeat(64),
  }
  const config: any = { previews: {} }
  configureAnalyticsDeployment(config, 'production', env)
  assert.equal(
    config.analytics_engine_datasets[0].dataset,
    'chronoframe_visits',
  )
  assert.ok(!JSON.stringify(config).includes('bbbbbbbb'))
  configureAnalyticsDeployment(config, 'staging', env)
  assert.equal(config.analytics_engine_datasets, undefined)
  assert.equal(
    config.previews.analytics_engine_datasets[0].dataset,
    'chronoframe_visits_preview',
  )
  assert.throws(() =>
    configureAnalyticsDeployment({}, 'production', {
      ...env,
      ANALYTICS_API_TOKEN: '',
    }),
  )
  configureAnalyticsDeployment(config, 'production', {
    ANALYTICS_ACCOUNT_ID: env.ANALYTICS_ACCOUNT_ID,
  })
  assert.equal(config.analytics_engine_datasets, undefined)
})
test('browser tracker counts initial entry and path navigation once, skips query-only duplication and respects privacy', async () => {
  const hooks: Record<string, () => void> = {},
    events: any[] = []
  let path = '/',
    navigator: any = {}
  const { installVisitTracking } = await module(
    '../apps/shared/analytics/tracker.ts',
    {
      navigator,
      location: {
        origin: 'https://gallery.example',
        search: '?utm_source=campaign',
      },
      document: { referrer: 'https://search.example/' },
      fetch: async (url: string, options: any) => {
        events.push({ url, options, body: JSON.parse(options.body) })
        return new Response()
      },
    },
  )
  installVisitTracking(
    {
      hook: (name: string, f: () => void) => {
        hooks[name] = f
      },
    },
    () => path,
  )
  hooks['app:mounted']!()
  hooks['page:finish']!()
  hooks['page:finish']!()
  assert.equal(events.length, 1)
  assert.equal(events[0].options.credentials, 'omit')
  assert.equal(events[0].body.source, 'campaign')
  path = '/albums/3'
  hooks['page:finish']!()
  assert.equal(events.length, 2)
  assert.equal(events[1].body.referrer, 'https://gallery.example/')
  path = '/'
  hooks['page:finish']!()
  assert.equal(events.length, 3)
  navigator.doNotTrack = '1'
  path = '/globe'
  hooks['page:finish']!()
  assert.equal(events.length, 3)
  navigator.doNotTrack = '0'
  navigator.globalPrivacyControl = true
  hooks['page:finish']!()
  assert.equal(events.length, 3)
})

test('relative minute/hour ranges preserve exact UTC boundaries and support a year or all time', () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const short = analyticsFilter(
    { from: '2026-11-01T11:30:00.000Z', to: '2026-11-01T12:00:00.000Z' },
    now,
  )
  const query = analyticsQueries('chronoframe_visits', short)
  assert.match(query.summary, /2026-11-01 11:30:00/)
  assert.match(query.summary, /2026-11-01 12:00:00/)
  assert.match(query.daily, /toStartOfMinute/)
  const hours = analyticsFilter(
    { from: '2026-10-31T12:00:00.000Z', to: '2026-11-01T12:00:00.000Z' },
    now,
  )
  assert.match(
    analyticsQueries('chronoframe_visits', hours).daily,
    /toStartOfHour/,
  )
  assert.doesNotThrow(() =>
    analyticsFilter({ from: '2025-11-01', to: '2026-11-01' }, now),
  )
  assert.equal(analyticsFilter({ allTime: '1' }, now).allTime, true)
  assert.throws(() =>
    analyticsFilter({ from: '2025-10-31', to: '2026-11-01' }, now),
  )
})
