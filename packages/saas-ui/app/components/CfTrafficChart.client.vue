<script setup lang="ts">
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import {
  trafficDays,
  trafficChartOption,
  type TrafficDay,
  type TrafficBucket,
} from '../utils/traffic-chart'
use([
  LineChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
])
const props = defineProps<{
  rows: TrafficDay[]
  from: string
  to: string
  zh?: boolean
  bucket?: TrafficBucket
}>()
const colorMode = useColorMode()
const option = computed(() =>
  trafficChartOption(
    trafficDays(props.rows, props.from, props.to, props.bucket),
    colorMode.value === 'dark',
    !!props.zh,
  ),
)
</script>
<template>
  <VChart
    class="cf-traffic-chart"
    :option="option"
    :init-options="{ renderer: 'svg' }"
    :update-options="{ notMerge: true }"
    autoresize
  />
</template>
<style scoped>
.cf-traffic-chart {
  height: 260px;
  width: 100%;
  min-width: 0;
}
</style>
