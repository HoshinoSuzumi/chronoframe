<script setup lang="ts">
const props = defineProps<{ report: any; zh?: boolean; admin?: boolean }>()
const tr = (en: string, zh: string) => (props.zh ? zh : en)
const format = (value: number) =>
  new Intl.NumberFormat(props.zh ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value)
const groups = computed(() => [
  ['pages', tr('Pages', '页面')],
  ['sources', tr('Referrer hosts', '来源域名')],
  ['countries', tr('Countries / regions', '国家/地区')],
  ['sites', tr('Site hosts', '站点域名')],
  ['browsers', tr('Browsers', '浏览器')],
  ['devices', tr('Devices', '设备')],
  ['systems', tr('Operating systems', '操作系统')],
  [
    'campaigns',
    tr('Campaigns (source / medium / campaign)', '推广来源/媒介/活动'),
  ],
])
const columns = (time = false) => [
  {
    accessorKey: 'label',
    header: time ? tr('Time (UTC)', '时间（UTC）') : tr('Dimension', '维度'),
  },
  {
    accessorKey: 'pv',
    header: 'PV',
    meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } },
  },
  {
    accessorKey: 'uv',
    header: time ? 'UV' : tr('Daily UV total', '每日 UV 合计'),
    meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } },
  },
]
</script>
<template>
  <div class="cf-analytics-report">
    <p class="cf-field-hint">
      {{
        tr(
          'UTC dates. UV is deduplicated daily without cookies; visitors returning on another day count again. Reports may lag and refresh at most once per minute. Known bots and privacy opt-outs are excluded.',
          '日期以 UTC 计算。UV 使用无 Cookie 的每日去重标识，跨天回访会再次计数。数据可能延迟，最多每分钟更新一次；排除已识别机器人及选择不被统计的访问。',
        )
      }}
    </p>
    <p
      v-if="report.notInitialized"
      role="status"
    >
      {{
        tr(
          'The dataset has not received its first visit yet.',
          '数据集尚未收到首次访问记录。',
        )
      }}
    </p>
    <p
      v-if="report.summary.sampleInterval > 1"
      role="status"
    >
      {{
        tr(
          'Cloudflare sampled these results. PV is weighted; UV is the observed daily visitor count and may be lower than the actual value.',
          'Cloudflare 对本次结果进行了采样。PV 已加权折算；UV 为采样中观测到的每日访客数，可能低于实际值。',
        )
      }}
    </p>
    <p
      v-if="report.archived"
      class="cf-field-hint"
    >
      {{ tr('Daily archive range: ', '按日归档统计范围：') }}{{ report.from }} —
      {{ report.to }} (UTC) · {{ tr('Collection started: ', '采集起始日：')
      }}{{ report.coverageStart }}
    </p>
    <p
      v-if="report.archiveGap || report.detailsLimited"
      role="status"
    >
      {{
        tr(
          'Some historical detail may be incomplete. Recent traffic is still included; contact support to check archive coverage.',
          '部分历史明细可能不完整。近期访问仍计入，请联系支持检查归档覆盖情况。',
        )
      }}
    </p>
    <div class="cf-analytics-metrics">
      <CfStatCard
        label="PV"
        :value="format(report.summary.pv)"
        :detail="tr('Page views', '页面浏览量')"
      />
      <CfStatCard
        :label="tr('Daily UV total', '每日 UV 合计')"
        :value="format(report.summary.uv)"
        :detail="
          tr(
            'Daily unique visitors summed across the selected dates',
            '所选日期范围内每日独立访客的合计',
          )
        "
      />
    </div>
    <CfCard class="cf-analytics-card">
      <h2>{{ tr('Traffic trend', '访问趋势') }}</h2>
      <ClientOnly>
        <LazyCfTrafficChart
          :bucket="report.bucket"
          :rows="report.daily"
          :from="report.from"
          :to="report.to"
          :zh="zh"
        />
        <template #fallback
          ><CfSkeleton class="cf-traffic-chart-placeholder"
        /></template>
      </ClientOnly>
      <div class="cf-analytics-table-wrap">
        <UTable
          :data="report.daily"
          :columns="columns(true)"
          :ui="{
            root: 'overflow-visible',
            td: 'whitespace-normal break-words text-[13px] px-2 py-2.5',
            th: 'text-[13px] px-2 py-2.5',
          }"
        >
          <template #pv-cell="{ row }">{{ format(row.original.pv) }}</template>
          <template #uv-cell="{ row }">{{ format(row.original.uv) }}</template>
          <template #empty>{{
            tr('No visits in this date range.', '此日期范围内暂无访问记录。')
          }}</template>
        </UTable>
      </div>
    </CfCard>
    <div class="cf-analytics-breakdowns">
      <CfCard
        v-for="[key, title] in groups"
        :key="key"
        class="cf-analytics-card"
      >
        <h2>
          {{ title }}
          <small class="cf-field-hint">{{ tr('Top 20', '前 20 项') }}</small>
        </h2>
        <div class="cf-analytics-table-wrap">
          <UTable
            :data="report[key]"
            :columns="columns()"
            :get-row-id="(row) => row.page?.key ?? row.label"
            :ui="{
              root: 'overflow-visible',
              td: 'whitespace-normal break-words text-[13px] px-2 py-2.5',
              th: 'text-[13px] px-2 py-2.5',
            }"
          >
            <template #label-cell="{ row }"
              ><CfAnalyticsPageLink
                v-if="key === 'pages'"
                :row="row.original"
                :admin="admin"
                :zh="zh"
              /><template v-else>{{ row.original.label }}</template></template
            >
            <template #pv-cell="{ row }">{{
              format(row.original.pv)
            }}</template>
            <template #uv-cell="{ row }">{{
              format(row.original.uv)
            }}</template>
            <template #empty>{{ tr('No data', '暂无数据') }}</template>
          </UTable>
        </div>
      </CfCard>
    </div>
  </div>
</template>
<style scoped>
.cf-analytics-report {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.cf-analytics-metrics,
.cf-analytics-breakdowns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.cf-analytics-card {
  padding: 20px;
  min-width: 0;
}
.cf-analytics-card h2 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}
.cf-analytics-table-wrap {
  overflow: auto;
  max-height: 360px;
  margin: 0 -20px -20px;
  padding: 0 20px 20px;
}
.cf-traffic-chart-placeholder {
  width: 100%;
  height: 260px;
}
@media (max-width: 700px) {
  .cf-analytics-metrics,
  .cf-analytics-breakdowns {
    grid-template-columns: 1fr;
  }
}
</style>
