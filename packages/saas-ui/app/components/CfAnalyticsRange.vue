<script setup lang="ts">
import { parseDate, type CalendarDate } from '@internationalized/date'
import {
  ANALYTICS_PRESETS,
  analyticsYearBoundary,
  inputInstant,
  rangeInput,
  relativeRange,
  type AnalyticsDateRange,
} from '../utils/analytics-range'
const props = defineProps<{
  modelValue: AnalyticsDateRange
  zh?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [AnalyticsDateRange]
  apply: []
}>()
const tr = (en: string, zh: string) => (props.zh ? zh : en)
const open = ref(false),
  utc = ref(false),
  custom = ref(''),
  draftFrom = ref(''),
  draftTo = ref(''),
  preset = ref<number>(),
  error = ref('')
const selected = ref<{ start?: CalendarDate; end?: CalendarDate }>({})
const allTime = ref(false)
const zoneLabel = computed(
  () => Intl.DateTimeFormat().resolvedOptions().timeZone,
)
function manualEdit() {
  preset.value = undefined
  allTime.value = false
}
function title(seconds: number) {
  const unit =
    seconds < 3600
      ? tr('minutes', '分钟')
      : seconds <= 86400
        ? tr('hours', '小时')
        : tr('days', '天')
  const value =
    seconds / (seconds < 3600 ? 60 : seconds <= 86400 ? 3600 : 86400)
  return props.zh ? `过去 ${value} ${unit}` : `Past ${value} ${unit}`
}
const label = computed(() =>
  props.modelValue.allTime
    ? tr('All time', '所有时间')
    : props.modelValue.preset
      ? title(props.modelValue.preset)
      : tr('Custom range', '自定义时间段'),
)
function syncCalendar() {
  if (draftFrom.value && draftTo.value)
    selected.value = {
      start: parseDate(draftFrom.value.slice(0, 10)),
      end: parseDate(draftTo.value.slice(0, 10)),
    }
}
function useRange(range: AnalyticsDateRange) {
  draftFrom.value = rangeInput(range.from, utc.value)
  draftTo.value = rangeInput(range.to, utc.value)
  allTime.value = !!range.allTime
  preset.value = range.preset
  error.value = ''
  if (range.allTime) selected.value = {}
  else syncCalendar()
}
watch(open, (value) => {
  if (value) {
    useRange(props.modelValue)
    custom.value = ''
  }
})
function choose(seconds: number) {
  useRange(relativeRange(seconds))
}
function calendarChange(value: { start?: CalendarDate; end?: CalendarDate }) {
  selected.value = value
  allTime.value = false
  preset.value = undefined
  if (value.start)
    draftFrom.value = `${value.start.toString()}T${draftFrom.value.slice(11) || '00:00'}`
  if (value.end)
    draftTo.value = `${value.end.toString()}T${draftTo.value.slice(11) || '23:59'}`
}
function customRange() {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(m|min|h|d|分钟|小时|天)\s*$/i.exec(
    custom.value,
  )
  if (!match) {
    error.value = tr(
      'Use a duration such as 30m, 3h or 7d.',
      '请输入 30m、3h 或 7d 等时间段。',
    )
    return
  }
  const unit = match[2]!.toLowerCase(),
    seconds =
      Number(match[1]) *
      (['m', 'min', '分钟'].includes(unit)
        ? 60
        : ['h', '小时'].includes(unit)
          ? 3600
          : 86400)
  const now = Date.now()
  if (seconds < 60 || seconds > 366 * 86400) {
    error.value = tr(
      'Choose between one minute and one year.',
      '请选择一分钟至一年之间的时间段。',
    )
    return
  }
  const range = relativeRange(seconds, now)
  if (Date.parse(range.from) < analyticsYearBoundary(now)) {
    error.value = tr(
      'Choose between one minute and one year.',
      '请选择一分钟至一年之间的时间段。',
    )
    return
  }
  useRange(range)
}
function chooseAll() {
  useRange({ ...relativeRange(365 * 86400), allTime: true })
}
function apply() {
  if (allTime.value) {
    emit('update:modelValue', { ...relativeRange(365 * 86400), allTime: true })
    emit('apply')
    open.value = false
    return
  }

  const start = inputInstant(draftFrom.value, utc.value),
    end = inputInstant(draftTo.value, utc.value)
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end > Date.now() + 60000 ||
    start < analyticsYearBoundary()
  ) {
    error.value = tr(
      'Choose a valid range within the past year.',
      '请选择最近一年内有效的起止时间。',
    )
    return
  }
  const range = preset.value
    ? relativeRange(preset.value)
    : { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
  emit('update:modelValue', range)
  emit('apply')
  open.value = false
}
function changeZone() {
  const previous = !utc.value,
    start = inputInstant(draftFrom.value, previous),
    end = inputInstant(draftTo.value, previous)
  if (Number.isFinite(start) && Number.isFinite(end))
    useRange({
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      preset: preset.value,
      allTime: allTime.value,
    })
}
</script>
<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end', sideOffset: 8 }"
    :ui="{ content: 'p-0' }"
  >
    <CfButton
      type="button"
      variant="secondary"
      :disabled="disabled"
      ><UIcon
        name="i-lucide-calendar-days"
        class="size-4" />{{ label
      }}<UIcon
        name="i-lucide-chevron-down"
        class="size-3.5"
    /></CfButton>
    <template #content>
      <section
        class="cf-range-picker"
        :aria-label="tr('Select time range', '选择时间段')"
      >
        <div class="cf-range-custom">
          <input
            v-model="custom"
            class="cf-input"
            :aria-label="tr('Custom duration', '自定义时长')"
            :placeholder="
              tr('Custom range: 30m, 3h, 7d…', '自定义时长：30m、3h、7d…')
            "
            @keydown.enter.prevent="customRange"
          /><CfButton
            v-if="custom"
            type="button"
            size="sm"
            variant="ghost"
            @click="customRange"
            ><UIcon
              name="i-lucide-arrow-right"
              class="size-4"
            /><span class="sr-only">{{
              tr('Use duration', '使用此时长')
            }}</span></CfButton
          >
        </div>
        <div class="cf-range-main">
          <div class="cf-range-calendar">
            <UCalendar
              :model-value="selected"
              range
              size="sm"
              @update:model-value="calendarChange"
            />
          </div>
          <div class="cf-range-presets">
            <button
              v-for="seconds in ANALYTICS_PRESETS"
              :key="seconds"
              type="button"
              :class="{ active: preset === seconds && !allTime }"
              @click="choose(seconds)"
            >
              {{ title(seconds) }}
            </button>
            <div class="cf-range-long-divider"></div>
            <button
              type="button"
              :class="{ active: preset === 365 * 86400 && !allTime }"
              @click="choose(365 * 86400)"
            >
              {{ tr('Past year', '过去一年') }}
            </button>
            <button
              type="button"
              :class="{ active: allTime }"
              @click="chooseAll"
            >
              {{ tr('All time', '所有时间') }}
            </button>
          </div>
        </div>
        <p
          v-if="allTime"
          class="cf-range-all-time"
        >
          {{
            tr(
              'All recorded history, from the beginning of collection to now.',
              '查询自开始采集以来直到现在的全部已记录数据。',
            )
          }}
        </p>
        <div
          v-else
          class="cf-range-inputs"
        >
          <label
            >{{ tr('Start', '开始')
            }}<input
              v-model="draftFrom"
              type="datetime-local"
              class="cf-input"
              @input="manualEdit"
              @change="syncCalendar" /></label
          ><label
            >{{ tr('End', '结束')
            }}<input
              v-model="draftTo"
              type="datetime-local"
              class="cf-input"
              @input="manualEdit"
              @change="syncCalendar"
          /></label>
        </div>
        <p
          v-if="error"
          class="cf-range-error"
          role="alert"
        >
          {{ error }}
        </p>
        <footer class="cf-range-footer">
          <CfSelect
            v-model="utc"
            class="cf-input"
            :aria-label="tr('Time zone', '时区')"
            @change="changeZone"
          >
            <option :value="false">
              {{
                zoneLabel === 'UTC' ? tr('Local time', '本地时间') : zoneLabel
              }}
            </option>
            <option :value="true">UTC</option></CfSelect
          ><CfButton
            type="button"
            @click="apply"
            >{{ tr('Apply', '应用') }}</CfButton
          >
        </footer>
      </section>
    </template>
  </UPopover>
</template>
<style scoped>
.cf-range-picker {
  width: min(540px, calc(100vw - 24px));
  background: var(--card);
  border-radius: 12px;
  overflow-y: auto;
  max-height: min(90dvh, var(--reka-popover-content-available-height, 90dvh));
}
.cf-range-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.cf-range-custom .cf-input {
  flex: 1;
  min-width: 0;
  border-color: transparent;
  box-shadow: none;
  background: transparent;
}
.cf-range-main {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
}
.cf-range-calendar {
  padding: 16px;
  border-right: 1px solid var(--border);
}
.cf-range-presets {
  display: grid;
  align-content: start;
  gap: 2px;
  padding: 16px 12px;
}
.cf-range-presets button {
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--foreground);
  cursor: pointer;
}
.cf-range-presets button:hover,
.cf-range-presets button.active {
  background: var(--secondary);
}
.cf-range-all-time {
  padding: 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted-foreground);
}
.cf-range-long-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}
.cf-range-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.cf-range-inputs label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
}
.cf-range-inputs input {
  width: 100%;
  min-width: 0;
  font-size: 12px;
}
.cf-range-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--background);
}
.cf-range-footer select {
  width: auto;
  max-width: 70%;
  font-size: 12px;
  border: 0;
  background: transparent;
}
.cf-range-error {
  font-size: 12px;
  padding: 0 16px 12px;
  color: var(--destructive);
}
@media (max-width: 480px) {
  .cf-range-main {
    grid-template-columns: 1fr;
  }
  .cf-range-calendar {
    border-right: 0;
    display: flex;
    justify-content: center;
  }
  .cf-range-presets {
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--border);
  }
  .cf-range-inputs {
    grid-template-columns: 1fr;
  }
}
</style>
