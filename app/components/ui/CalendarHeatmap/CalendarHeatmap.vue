<script setup lang="ts">
import type { CreateSingletonInstance, Instance } from 'tippy.js'
import tippy, { createSingleton } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/dist/svg-arrow.css'
import {
  Heatmap,
  COLOR_THEMES,
  type CalendarItem,
  type Locale,
  type Month,
  type TooltipFormatter,
  type Value,
} from './Heatmap'

interface Props {
  endDate: Date | string
  values: Value[]
  max?: number
  rangeColor?: string[]
  locale?: Partial<Locale>
  tooltip?: boolean
  tooltipUnit?: string
  tooltipFormatter?: TooltipFormatter
  vertical?: boolean
  tooltipNoDataFormatter?: (date: Date) => string
  round?: number
  darkMode?: boolean
  startDate?: Date | string
  theme?: keyof typeof COLOR_THEMES
}

const props = withDefaults(defineProps<Props>(), {
  max: undefined,
  rangeColor: undefined,
  locale: undefined,
  tooltip: true,
  tooltipUnit: undefined,
  tooltipFormatter: undefined,
  vertical: false,
  tooltipNoDataFormatter: undefined,
  round: 0,
  darkMode: false,
  startDate: undefined,
  theme: 'blue',
})

// Emits 定义
interface Emits {
  dayClick: [day: CalendarItem]
}

const emit = defineEmits<Emits>()

const { t } = useI18n()

const i18nLocale = computed<Locale>(() => ({
  months: [
    t('common.months.jan'),
    t('common.months.feb'),
    t('common.months.mar'),
    t('common.months.apr'),
    t('common.months.may'),
    t('common.months.jun'),
    t('common.months.jul'),
    t('common.months.aug'),
    t('common.months.sep'),
    t('common.months.oct'),
    t('common.months.nov'),
    t('common.months.dec'),
  ],
  days: [
    t('common.days.sun'),
    t('common.days.mon'),
    t('common.days.tue'),
    t('common.days.wed'),
    t('common.days.thu'),
    t('common.days.fri'),
    t('common.days.sat'),
  ],
  on: t('ui.calendarHeatmap.on'),
  less: t('common.heatmap.legend.less'),
  more: t('common.heatmap.legend.more'),
}))

const effectiveTooltipUnit = computed(
  () => props.tooltipUnit ?? t('ui.calendarHeatmap.contributions'),
)

const BASE_SQUARE_SIZE = 10
const DAYS_IN_WEEK = 7

// 常量定义
const SQUARE_BORDER_SIZE = BASE_SQUARE_SIZE / 5
const SQUARE_SIZE = BASE_SQUARE_SIZE + SQUARE_BORDER_SIZE
const LEFT_SECTION_WIDTH = Math.ceil(BASE_SQUARE_SIZE * 2.5)
const RIGHT_SECTION_WIDTH = SQUARE_SIZE * 3
const TOP_SECTION_HEIGHT = BASE_SQUARE_SIZE + BASE_SQUARE_SIZE / 2
const BOTTOM_SECTION_HEIGHT = BASE_SQUARE_SIZE + BASE_SQUARE_SIZE / 2
const yearWrapperTransform = `translate(${LEFT_SECTION_WIDTH}, ${TOP_SECTION_HEIGHT})`

const svg = ref<SVGElement | null>(null)
const now = ref(new Date())
const heatmap = ref(
  new Heatmap(
    props.endDate as Date,
    props.values,
    props.max,
    props.startDate as Date,
  ),
)
const width = ref(0)
const height = ref(0)
const viewbox = ref('0 0 0 0')
const legendViewbox = ref('0 0 0 0')
const daysLabelWrapperTransform = ref('')
const monthsLabelWrapperTransform = ref('')
const legendWrapperTransform = ref('')
const lo = ref<Locale>(i18nLocale.value)

const rangeColor = ref<string[]>(
  props.rangeColor || [
    ...(props.darkMode
      ? COLOR_THEMES[props.theme].dark
      : COLOR_THEMES[props.theme].light),
  ],
)

const tippyInstances = new Map<HTMLElement, Instance>()
let tippySingleton: CreateSingletonInstance

function initTippy() {
  // Dispose the singleton before its references when the calendar changes.
  // Updating an active singleton with an empty list leaves Popper with no rect.
  tippySingleton?.destroy()
  tippyInstances.forEach((item) => item.destroy())
  tippyInstances.clear()
  tippySingleton = createSingleton([], {
    overrides: [],
    moveTransition: 'transform 0.1s ease-out',
    allowHTML: true,
  })
}

function tooltipOptions(day: CalendarItem): string | undefined {
  if (props.tooltip) {
    if (day.count !== undefined) {
      if (props.tooltipFormatter) {
        return props.tooltipFormatter(day, effectiveTooltipUnit.value)
      }
      return `<b>${day.count} ${effectiveTooltipUnit.value}</b> ${lo.value.on} ${lo.value.months[day.date.getMonth()]} ${day.date.getDate()}, ${day.date.getFullYear()}`
    } else if (props.tooltipNoDataFormatter) {
      return props.tooltipNoDataFormatter(day.date)
    } else {
      return `<b>No ${effectiveTooltipUnit.value}</b> ${lo.value.on} ${lo.value.months[day.date.getMonth()]} ${day.date.getDate()}, ${day.date.getFullYear()}`
    }
  }
  return undefined
}

function getWeekPosition(index: number): string {
  if (props.vertical) {
    return `translate(0, ${SQUARE_SIZE * heatmap.value.weekCount - (index + 1) * SQUARE_SIZE})`
  }
  return `translate(${index * SQUARE_SIZE}, 0)`
}

function getDayPosition(index: number): string {
  if (props.vertical) {
    return `translate(${index * SQUARE_SIZE}, 0)`
  }
  return `translate(0, ${index * SQUARE_SIZE})`
}

function getMonthLabelPosition(month: Month): { x: number; y: number } {
  // Find the exact position of the 1st day in the calendar
  const calendar = heatmap.value.calendar
  let exactPosition = month.index * SQUARE_SIZE

  // Look for the 1st day of this month in the calendar
  const week = calendar[month.index]
  if (week && week.length > 0) {
    for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
      const day = week[dayIndex]
      if (
        day &&
        day.date.getTime() > 0 &&
        day.date.getDate() === 1 &&
        day.date.getMonth() === month.value
      ) {
        if (props.vertical) {
          exactPosition =
            SQUARE_SIZE * heatmap.value.weekCount -
            SQUARE_SIZE * month.index -
            SQUARE_SIZE / 4
        } else {
          exactPosition = month.index * SQUARE_SIZE
        }
        break
      }
    }
  }

  if (props.vertical) {
    return {
      x: 3,
      y: exactPosition,
    }
  }
  return {
    x: exactPosition,
    y: SQUARE_SIZE - SQUARE_BORDER_SIZE,
  }
}

function initTippyLazy(e: MouseEvent): void {
  if (
    tippySingleton &&
    e.target &&
    (e.target as HTMLElement).classList.contains('vch__day__square') &&
    (e.target as HTMLElement).dataset.weekIndex !== undefined &&
    (e.target as HTMLElement).dataset.dayIndex !== undefined
  ) {
    const weekIndex = Number((e.target as HTMLElement).dataset.weekIndex)
    const dayIndex = Number((e.target as HTMLElement).dataset.dayIndex)

    if (!isNaN(weekIndex) && !isNaN(dayIndex)) {
      const dayData = heatmap.value.calendar[weekIndex]?.[dayIndex]
      if (dayData) {
        const tooltip = tooltipOptions(dayData)
        if (tooltip) {
          const instance = tippyInstances.get(e.target as HTMLElement)

          if (instance) {
            instance.setContent(tooltip)
          } else {
            tippyInstances.set(
              e.target as HTMLElement,
              tippy(e.target as HTMLElement, { content: tooltip }),
            )
            tippySingleton.setInstances(Array.from(tippyInstances.values()))
          }
        }
      }
    }
  }
}

watch(
  [() => props.rangeColor, () => props.darkMode, () => props.theme],
  ([rc, dm, theme]) => {
    rangeColor.value = rc || [
      ...(dm ? COLOR_THEMES[theme].dark : COLOR_THEMES[theme].light),
    ]
  },
)

watch(
  [() => props.vertical, () => heatmap.value.weekCount],
  ([v]) => {
    if (v) {
      width.value =
        LEFT_SECTION_WIDTH + SQUARE_SIZE * DAYS_IN_WEEK + RIGHT_SECTION_WIDTH
      height.value =
        TOP_SECTION_HEIGHT +
        SQUARE_SIZE * heatmap.value.weekCount +
        SQUARE_BORDER_SIZE
      daysLabelWrapperTransform.value = `translate(${LEFT_SECTION_WIDTH}, 0)`
      monthsLabelWrapperTransform.value = `translate(0, ${TOP_SECTION_HEIGHT})`
    } else {
      width.value =
        LEFT_SECTION_WIDTH +
        SQUARE_SIZE * heatmap.value.weekCount +
        SQUARE_BORDER_SIZE
      height.value = TOP_SECTION_HEIGHT + SQUARE_SIZE * DAYS_IN_WEEK
      daysLabelWrapperTransform.value = `translate(0, ${TOP_SECTION_HEIGHT})`
      monthsLabelWrapperTransform.value = `translate(${LEFT_SECTION_WIDTH}, 0)`
    }
  },
  { immediate: true },
)

watch([width, height], ([w, h]) => (viewbox.value = `0 0 ${w} ${h}`), {
  immediate: true,
})

watch(
  [width, height, rangeColor],
  ([w, h, rc]) => {
    legendWrapperTransform.value = props.vertical
      ? `translate(${LEFT_SECTION_WIDTH + SQUARE_SIZE * DAYS_IN_WEEK}, ${TOP_SECTION_HEIGHT})`
      : `translate(${w - SQUARE_SIZE * rc.length - 30}, ${h - BOTTOM_SECTION_HEIGHT})`
  },
  { immediate: true },
)

watch(
  [() => props.locale, i18nLocale],
  ([l, base]) => {
    lo.value = l ? { ...base, ...l } : base
  },
  { immediate: true },
)

watch(
  rangeColor,
  (rc) => {
    legendViewbox.value = `0 0 ${BASE_SQUARE_SIZE * (rc.length + 1)} ${BASE_SQUARE_SIZE}`
  },
  { immediate: true },
)

watch(
  [
    () => props.values,
    effectiveTooltipUnit,
    () => props.tooltipFormatter,
    () => props.tooltipNoDataFormatter,
    () => props.max,
    () => props.startDate,
    () => props.endDate,
    rangeColor,
  ],
  () => {
    heatmap.value = new Heatmap(
      props.endDate as Date,
      props.values,
      props.max,
      props.startDate as Date,
    )
    nextTick(initTippy)
  },
)

onMounted(initTippy)
onBeforeUnmount(() => {
  tippySingleton?.destroy()
  tippyInstances.forEach((item) => item.destroy())
})

const curRangeColor = rangeColor

function handleDayClick(day: CalendarItem): void {
  emit('dayClick', day)
}
</script>

<template>
  <div :class="{ vch__container: true, 'dark-mode': darkMode }">
    <svg
      ref="svg"
      class="vch__wrapper"
      :viewBox="viewbox"
    >
      <g
        class="vch__months__labels__wrapper"
        :transform="monthsLabelWrapperTransform"
      >
        <text
          v-for="(month, index) in heatmap.firstFullWeekOfMonths"
          :key="index"
          class="vch__month__label"
          :x="getMonthLabelPosition(month).x"
          :y="getMonthLabelPosition(month).y"
        >
          {{ lo.months[month.value] }}
        </text>
      </g>

      <g
        class="vch__days__labels__wrapper"
        :transform="daysLabelWrapperTransform"
      >
        <text
          class="vch__day__label"
          :x="vertical ? SQUARE_SIZE : 0"
          :y="vertical ? SQUARE_SIZE - SQUARE_BORDER_SIZE : 20"
        >
          {{ lo.days[1] }}
        </text>
        <text
          class="vch__day__label"
          :x="vertical ? SQUARE_SIZE * 3 : 0"
          :y="vertical ? SQUARE_SIZE - SQUARE_BORDER_SIZE : 44"
        >
          {{ lo.days[3] }}
        </text>
        <text
          class="vch__day__label"
          :x="vertical ? SQUARE_SIZE * 5 : 0"
          :y="vertical ? SQUARE_SIZE - SQUARE_BORDER_SIZE : 69"
        >
          {{ lo.days[5] }}
        </text>
      </g>

      <g
        v-if="vertical"
        class="vch__legend__wrapper"
        :transform="legendWrapperTransform"
      >
        <text
          :x="SQUARE_SIZE * 1.25"
          y="8"
        >
          {{ lo.less }}
        </text>
        <rect
          v-for="(color, index) in curRangeColor"
          :key="index"
          :rx="round"
          :ry="round"
          :style="{ fill: color }"
          :width="SQUARE_SIZE - SQUARE_BORDER_SIZE"
          :height="SQUARE_SIZE - SQUARE_BORDER_SIZE"
          :x="SQUARE_SIZE * 1.75"
          :y="SQUARE_SIZE * (index + 1)"
        />
        <text
          :x="SQUARE_SIZE * 1.25"
          :y="SQUARE_SIZE * (curRangeColor.length + 2) - SQUARE_BORDER_SIZE"
        >
          {{ lo.more }}
        </text>
      </g>

      <g
        class="vch__year__wrapper"
        :transform="yearWrapperTransform"
        @mouseover="initTippyLazy"
      >
        <g
          v-for="(week, weekIndex) in heatmap.calendar"
          :key="weekIndex"
          class="vch__month__wrapper"
          :transform="getWeekPosition(weekIndex)"
        >
          <template
            v-for="(day, dayIndex) in week"
            :key="dayIndex"
          >
            <rect
              v-if="
                day.date.getTime() > 0 &&
                (day.date <= now || heatmap.isExactYearRange())
              "
              class="vch__day__square"
              :rx="round"
              :ry="round"
              :transform="getDayPosition(dayIndex)"
              :width="SQUARE_SIZE - SQUARE_BORDER_SIZE"
              :height="SQUARE_SIZE - SQUARE_BORDER_SIZE"
              :style="{ fill: curRangeColor[day.colorIndex] }"
              :data-week-index="weekIndex"
              :data-day-index="dayIndex"
              @click="handleDayClick(day)"
            />
          </template>
        </g>
      </g>
    </svg>
    <div class="vch__legend">
      <slot name="legend">
        <div class="vch__legend-left">
          <slot name="vch__legend-left" />
        </div>
        <div class="vch__legend-right">
          <slot name="legend-right">
            <div class="vch__legend">
              <div>{{ lo.less }}</div>
              <svg
                v-if="!vertical"
                class="vch__external-legend-wrapper"
                :viewBox="legendViewbox"
                :height="SQUARE_SIZE - SQUARE_BORDER_SIZE"
              >
                <g class="vch__legend__wrapper">
                  <rect
                    v-for="(color, index) in curRangeColor"
                    :key="index"
                    :rx="round"
                    :ry="round"
                    :style="{ fill: color }"
                    :width="SQUARE_SIZE - SQUARE_BORDER_SIZE"
                    :height="SQUARE_SIZE - SQUARE_BORDER_SIZE"
                    :x="SQUARE_SIZE * index"
                  />
                </g>
              </svg>
              <div>{{ lo.more }}</div>
            </div>
          </slot>
        </div>
      </slot>
    </div>
  </div>
</template>

<style lang="scss">
.vch__container {
  .vch__legend {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .vch__external-legend-wrapper {
    margin: 0 8px;
  }
}

svg.vch__wrapper {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu,
    Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  line-height: 10px;
  width: 100%;

  .vch__months__labels__wrapper text.vch__month__label {
    font-size: 10px;
  }

  .vch__days__labels__wrapper text.vch__day__label,
  .vch__legend__wrapper text {
    font-size: 9px;
  }

  text.vch__month__label,
  text.vch__day__label,
  .vch__legend__wrapper text {
    fill: #767676;
  }

  rect.vch__day__square:hover {
    stroke: #555;
    stroke-width: 2px;
    paint-order: stroke;
  }

  rect.vch__day__square:focus {
    outline: none;
  }

  &.dark-mode {
    text.vch__month__label,
    text.vch__day__label,
    .vch__legend__wrapper text {
      fill: #fff;
    }
  }
}
</style>
