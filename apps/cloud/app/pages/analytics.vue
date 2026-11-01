<script setup lang="ts">
import { archiveRange, relativeRange } from '#saas-ui/utils/analytics-range'
definePageMeta({ layout: 'portal' })
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const tr = (en: string, cn: string) => (zh.value ? cn : en)
useSeoMeta({
  title: () => tr('Analytics — ChronoFrame Cloud', '分析 — ChronoFrame Cloud'),
  robots: 'noindex',
})
const billing = useWorkspaceBilling()
await billing.ready
if (!billing.data.value?.plan?.analytics)
  throw createError({
    statusCode: 403,
    statusMessage: 'Analytics is not included in this plan',
  })
const fetcher = useRequestFetch()
const { data: siteList } = await useAsyncData('analytics-site-options', () =>
  fetcher<any>('/api/sites'),
)
const sites = computed(() =>
  (siteList.value?.sites ?? []).filter(
    (s: any) => s.workspaceId === billing.selected.value,
  ),
)
const siteId = ref('')
const range = useState('workspace-analytics-range', () =>
  relativeRange(7 * 86400),
)
const report = ref<any>(),
  loading = ref(false),
  error = ref('')
function refreshRange() {
  if (range.value.preset && !range.value.allTime)
    range.value = relativeRange(range.value.preset)
  void load()
}
let generation = 0
async function load() {
  const request = ++generation
  loading.value = true
  error.value = ''
  report.value = null
  try {
    const bounds = archiveRange(range.value)
    const result = await fetcher('/api/analytics/report', {
      query: {
        workspaceId: billing.selected.value,
        siteId: siteId.value || undefined,
        from: bounds.from,
        to: bounds.to,
        allTime: range.value.allTime ? '1' : undefined,
      },
      timeout: 20000,
    })
    if (request === generation) report.value = result
  } catch (e: any) {
    if (request === generation)
      error.value =
        e.statusCode === 403
          ? tr(
              'Your plan does not include analytics.',
              '当前套餐不包含分析权益。',
            )
          : tr(
              'Unable to load analytics. Check the date range or try again later.',
              '无法加载分析数据，请检查日期范围或稍后重试。',
            )
  } finally {
    if (request === generation) loading.value = false
  }
}
if (range.value.preset && !range.value.allTime)
  range.value = relativeRange(range.value.preset)
await load()
</script>
<template>
  <div class="cf-dashboard">
    <header>
      <h1 class="cf-page-title">{{ tr('Analytics', '分析') }}</h1>
      <p class="cf-page-description">
        {{
          tr(
            'Traffic to the public galleries in your workspace.',
            '查看工作区内公开站点的访问情况。',
          )
        }}
      </p>
    </header>
    <CfCard class="p-5"
      ><form
        class="flex flex-wrap items-end gap-4"
        @submit.prevent="load"
      >
        <label class="grid gap-2"
          >{{ tr('Site', '站点')
          }}<select
            v-model="siteId"
            @change="load"
            class="cf-input"
          >
            <option value="">{{ tr('All sites', '全部站点') }}</option>
            <option
              v-for="site in sites"
              :key="site.siteId"
              :value="String(site.siteId)"
            >
              {{ site.name }}
            </option>
          </select></label
        >
        <CfAnalyticsRange
          v-model="range"
          :zh="zh"
          :disabled="loading"
          @apply="load"
        />
        <CfButton
          type="button"
          variant="secondary"
          :disabled="loading"
          :aria-label="tr('Refresh', '刷新')"
          :title="tr('Refresh', '刷新')"
          @click="refreshRange"
          ><UIcon
            name="i-lucide-refresh-cw"
            class="size-4"
        /></CfButton>
        <p class="cf-field-hint">
          {{
            tr(
              'Custom ranges support the past year; ranges over 31 days or starting more than about 90 days ago use full UTC days.',
              '自定义范围支持最近一年；超过 31 天或开始于约 90 天以前的范围使用完整的 UTC 日期。',
            )
          }}
        </p>
      </form></CfCard
    >
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <CfSkeleton
      v-if="loading"
      class="h-64 w-full"
    />
    <CfAnalyticsReport
      v-else-if="report"
      :report="report"
      :zh="zh"
    />
  </div>
</template>
