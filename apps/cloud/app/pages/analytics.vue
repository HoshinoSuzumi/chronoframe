<script setup lang="ts">
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
const siteId = ref(''),
  to = ref(new Date().toISOString().slice(0, 10)),
  from = ref(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10))
const report = ref<any>(),
  loading = ref(false),
  error = ref('')
let generation = 0
async function load() {
  const request = ++generation
  loading.value = true
  error.value = ''
  report.value = null
  try {
    const result = await fetcher('/api/analytics/report', {
      query: {
        workspaceId: billing.selected.value,
        siteId: siteId.value || undefined,
        from: from.value,
        to: to.value,
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
        <label class="grid gap-2"
          >{{ tr('From (UTC)', '开始日期（UTC）')
          }}<input
            v-model="from"
            type="date"
            required
            class="cf-input"
        /></label>
        <label class="grid gap-2"
          >{{ tr('To (UTC)', '结束日期（UTC）')
          }}<input
            v-model="to"
            type="date"
            required
            class="cf-input"
        /></label>
        <CfButton
          type="submit"
          :disabled="loading"
          >{{ tr('Apply', '应用') }}</CfButton
        >
        <p class="cf-field-hint">
          {{
            tr(
              'Select up to 31 days within the last 90 days.',
              '可查询最近 90 天内、最长 31 天的数据。',
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
