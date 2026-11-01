import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import {
  trafficDays,
  trafficChartOption,
} from '../packages/saas-ui/app/utils/traffic-chart.ts'
import {
  relativeRange,
  archiveRange,
  rangeInput,
  inputInstant,
  ANALYTICS_PRESETS,
  analyticsYearBoundary,
} from '../packages/saas-ui/app/utils/analytics-range.ts'
test('sparse day/minute/hour reports preserve the selected UTC axis and their real values', () => {
  const days = trafficDays(
    [{ label: '2026-11-01', pv: 2, uv: 1 }],
    '2026-10-26',
    '2026-11-01',
  )
  assert.equal(days.length, 7)
  assert.equal(days[0]!.pv, 0)
  assert.equal(days[6]!.pv, 2)
  const minutes = trafficDays(
    [{ label: '2026-11-01 11:31:00', pv: 3, uv: 1 }],
    '2026-11-01T11:30:00Z',
    '2026-11-01T12:00:00Z',
    'minute',
  )
  assert.equal(minutes.length, 30)
  assert.equal(minutes[1]!.pv, 3)
  assert.equal(minutes[1]!.label, '2026-11-01T11:31:00Z')
  assert.equal(trafficDays([], '2025-11-01', '2026-11-01').length, 366)
})
test('year boundary accepts a leap year and excludes durations before the UTC calendar boundary', () => {
  const leapNow = Date.parse('2024-12-31T00:00:00Z')
  assert.equal(
    Date.parse(relativeRange(366 * 86400, leapNow).from),
    analyticsYearBoundary(leapNow),
  )
  const ordinaryNow = Date.parse('2025-12-31T00:00:00Z')
  assert.ok(
    Date.parse(relativeRange(366 * 86400, ordinaryNow).from) <
      analyticsYearBoundary(ordinaryNow),
  )
  assert.equal(
    Date.parse(relativeRange(365 * 86400, ordinaryNow).from),
    analyticsYearBoundary(ordinaryNow),
  )
})
test('relative presets and local/UTC inputs retain actual instants across timezone changes', () => {
  assert.deepEqual(
    ANALYTICS_PRESETS,
    [1800, 3600, 21600, 43200, 86400, 604800, 2592000],
  )
  const range = relativeRange(1800, Date.parse('2026-11-01T12:00:39Z'))
  assert.equal(range.from, '2026-11-01T11:30:00.000Z')
  assert.equal(range.to, '2026-11-01T12:00:00.000Z')
  const previous = process.env.TZ
  try {
    process.env.TZ = 'Asia/Hong_Kong'
    const instant = '2026-11-01T04:00:00.000Z'
    assert.equal(rangeInput(instant, false), '2026-11-01T12:00')
    assert.equal(inputInstant('2026-11-01T12:00', false), Date.parse(instant))
    assert.equal(
      inputInstant('2026-11-01T12:00', true),
      Date.parse('2026-11-01T12:00Z'),
    )
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
test('long or old picker ranges request full UTC archive days while recent short ranges stay precise', () => {
  const now = Date.parse('2026-11-01T12:00:00Z')
  const year = relativeRange(365 * 86400, now)
  assert.deepEqual(archiveRange(year, now), {
    ...year,
    from: '2025-11-01',
    to: '2026-11-01',
  })
  const custom = {
    from: '2026-08-01T23:30:00.000Z',
    to: '2026-10-01T00:00:00.000Z',
  }
  assert.deepEqual(archiveRange(custom, now), {
    from: '2026-08-01',
    to: '2026-09-30',
  })
  const short = relativeRange(30 * 86400, now)
  assert.deepEqual(archiveRange(short, now), short)
  const cutoff = now - 89 * 86400000
  const atCutoff = {
    from: new Date(cutoff).toISOString(),
    to: new Date(cutoff + 86400000).toISOString(),
  }
  assert.deepEqual(archiveRange(atCutoff, now), atCutoff)
  assert.deepEqual(
    archiveRange(
      { from: '2026-07-01T23:30:00Z', to: '2026-07-03T00:00:00Z' },
      now,
    ),
    { from: '2026-07-01', to: '2026-07-02' },
  )
  assert.deepEqual(archiveRange({ ...year, allTime: true }, now), {
    ...year,
    allTime: true,
  })
})
test('the registered ECharts modules render a single-day report as a valid colored SVG without browser globals', async () => {
  const require = createRequire(
    new URL('../packages/saas-ui/package.json', import.meta.url),
  )
  const load = (name: string) =>
    import(pathToFileURL(require.resolve(name)).href)
  const [core, charts, components, renderers] = await Promise.all(
    [
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
    ].map(load),
  )
  core.use([
    charts.LineChart,
    components.GridComponent,
    components.LegendComponent,
    components.TooltipComponent,
    components.AriaComponent,
    renderers.SVGRenderer,
  ])
  const chart = core.init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 900,
    height: 260,
  })
  try {
    chart.setOption(
      trafficChartOption([{ label: '2026-11-01', pv: 2, uv: 1 }], false, true),
    )
    const svg = chart.renderToSVGString()
    assert.match(svg, /<svg/)
    assert.match(svg, /PV/)
    assert.match(svg, /#3b82f6/)
    assert.match(svg, /#0d9488/)
    assert.ok(!svg.includes('NaN'))
  } finally {
    chart.dispose()
  }
})
