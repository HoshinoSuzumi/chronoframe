import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type {
  AriaComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
export type TrafficDay = { label: string; pv: number; uv: number }
type TrafficOption = ComposeOption<
  | LineSeriesOption
  | AriaComponentOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>
/** Keep zero-traffic dates on the UTC axis rather than stretching one observed day. */
export type TrafficBucket = 'minute' | 'hour' | 'day'
export function trafficDays(
  rows: readonly TrafficDay[],
  from: string,
  to: string,
  bucket: TrafficBucket = 'day',
): TrafficDay[] {
  const interval =
    bucket === 'minute' ? 60000 : bucket === 'hour' ? 3600000 : 86400000
  const first = Math.floor(Date.parse(from) / interval) * interval
  const end = Date.parse(to) + (to.length === 10 ? 86400000 : 0)
  if (!Number.isFinite(first) || !Number.isFinite(end) || first >= end)
    return []
  const count = Math.min(10000, Math.ceil((end - first) / interval))
  const key = (value: number) =>
    new Date(value).toISOString().slice(0, bucket === 'day' ? 10 : 19) +
    (bucket === 'day' ? '' : 'Z')
  const byTime = new Map(
    rows.map((row) => {
      const raw =
        row.label.length === 10 || row.label.endsWith('Z')
          ? row.label
          : row.label.replace(' ', 'T') + 'Z'
      return [key(Math.floor(Date.parse(raw) / interval) * interval), row]
    }),
  )
  return Array.from({ length: count }, (_, index) => {
    const label = key(first + index * interval),
      row = byTime.get(label)
    return { label, pv: row?.pv ?? 0, uv: row?.uv ?? 0 }
  })
}
export function trafficChartOption(
  days: readonly TrafficDay[],
  dark: boolean,
  zh: boolean,
): TrafficOption {
  const text = dark ? '#a8aebb' : '#646873',
    border = dark ? '#353943' : '#e7eaf0'
  const pv = dark ? '#60a5fa' : '#3b82f6',
    uv = dark ? '#2dd4bf' : '#0d9488'
  const locale = zh ? 'zh-CN' : 'en-US'
  return {
    animationDuration: 300,
    backgroundColor: 'transparent',
    color: [pv, uv],
    textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif' },
    aria: {
      enabled: true,
      label: {
        description: zh
          ? '每日页面浏览量与独立访客，日期以 UTC 计算。具体数值见下方表格。'
          : 'Daily page views and unique visitors in UTC. Exact values are in the table below.',
      },
    },
    grid: { top: 52, right: 16, bottom: 12, left: 4, containLabel: true },
    legend: {
      top: 4,
      left: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 4,
      itemGap: 24,
      textStyle: { color: text, fontSize: 12 },
      data: ['PV', zh ? '每日 UV' : 'Daily UV'],
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      renderMode: 'richText',
      backgroundColor: dark ? '#242831' : '#ffffff',
      borderColor: border,
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: dark ? '#e5e7eb' : '#282a30', fontSize: 12 },
      axisPointer: {
        type: 'line',
        lineStyle: { color: dark ? '#707a8e' : '#aab4c6', type: 'dashed' },
      },
      valueFormatter: (value) =>
        new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
          Number(value),
        ),
    },
    xAxis: {
      type: 'category',
      data: days.map((day) => day.label),
      boundaryGap: false,
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: {
        color: text,
        fontSize: 11,
        margin: 14,
        hideOverlap: true,
        formatter: (value: string) =>
          value.includes('T')
            ? value.slice(5, 10) + '\n' + value.slice(11, 16)
            : days.length > 366
              ? value.slice(0, 7)
              : value.slice(5),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      axisLabel: {
        color: text,
        fontSize: 11,
        formatter: (value: number) =>
          new Intl.NumberFormat(locale, { notation: 'compact' }).format(value),
      },
      splitLine: { lineStyle: { color: border, type: 'dashed' } },
    },
    series: [
      {
        name: 'PV',
        type: 'line',
        data: days.map((day) => day.pv),
        showSymbol: days.length === 1,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        itemStyle: { color: pv },
        emphasis: { focus: 'series' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: dark ? 'rgba(96,165,250,0.24)' : 'rgba(59,130,246,0.18)',
              },
              { offset: 1, color: 'rgba(59,130,246,0.01)' },
            ],
          },
        },
      },
      {
        name: zh ? '每日 UV' : 'Daily UV',
        type: 'line',
        data: days.map((day) => day.uv),
        showSymbol: days.length === 1,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5 },
        itemStyle: { color: uv },
        emphasis: { focus: 'series' },
      },
    ],
  }
}
