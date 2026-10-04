<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

interface LogEntry {
  date: string
  args: string[]
  message: string
  messageLower: string
  type: string
  level: number
  tag: string
  tagLower: string
  raw: string
}

const logs = shallowRef<LogEntry[]>([])
const searchQuery = ref('')
const selectedLevels = ref<string[]>([])
const selectedTags = ref<string[]>([])
const autoScroll = ref(true)
const isConnected = ref(false)
const connectionState = ref<
  'idle' | 'connecting' | 'loadingHistory' | 'live' | 'error'
>('idle')
const logContainer = ref<HTMLElement>()
const isInitialLoading = ref(false)
const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLowerCase(),
)
const scrollTop = ref(0)
const containerHeight = ref(0)
const MAX_LOG_LINES = 6000
const historyCursor = ref(0)
const isLoadingOlder = ref(false)
let liveOffset = 0
let fileIdentity = ''
let requestController: AbortController | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false
let isPositioningInitialLogs = false
let smoothScrollTarget: number | null = null
const cancelSmoothScroll = () => {
  smoothScrollTarget = null
}

interface LogPage {
  lines: string[]
  before: number
  offset: number
  identity: string
}

const ROW_HEIGHT = 28
const VIRTUAL_OVERSCAN = 20
const VIRTUAL_BOTTOM_PADDING = 8
const HISTORY_LOAD_THRESHOLD = ROW_HEIGHT * 10

let resizeObserver: ResizeObserver | null = null

const logLevels = ['error', 'warn', 'info', 'success', 'debug']

// 根据级别数字获取类型名称
const getLevelType = (level: number): string => {
  const levelMap: Record<number, string> = {
    0: 'error',
    1: 'warn',
    2: 'info',
    3: 'info',
    4: 'debug',
  }
  return levelMap[level] || 'info'
}

// EventSource 连接
let eventSource: EventSource | null = null

// 解析日志行
const parseLogLine = (line: string): LogEntry | null => {
  try {
    const logData = JSON.parse(line)
    const args = Array.isArray(logData.args)
      ? logData.args.map((arg: unknown) =>
          typeof arg === 'string' ? arg : JSON.stringify(arg),
        )
      : []
    const message = args.join(' ')
    const tag = String(logData.tag || '')

    return {
      date: logData.date,
      args,
      message,
      messageLower: message.toLowerCase(),
      type: logData.type || 'info',
      level: logData.level ?? 3,
      tag,
      tagLower: tag.toLowerCase(),
      raw: line,
    }
  } catch {
    // 如果解析失败，创建一个fallback日志条目
    const message = line
    return {
      date: new Date().toISOString(),
      args: [line],
      message,
      messageLower: message.toLowerCase(),
      type: 'info',
      level: 3,
      tag: 'fallback',
      tagLower: 'fallback',
      raw: line,
    }
  }
}

// 过滤后的日志
const filteredLogs = computed(() => {
  let filtered = logs.value

  // 按级别过滤
  if (selectedLevels.value.length > 0) {
    filtered = filtered.filter((log) => {
      const logType = log.type || getLevelType(log.level)
      return selectedLevels.value.includes(logType)
    })
  }

  // 按标签过滤
  if (selectedTags.value.length > 0) {
    const selected = new Set(selectedTags.value)
    filtered = filtered.filter((log) => selected.has(log.tag))
  }

  // 按搜索词过滤
  if (normalizedSearchQuery.value) {
    const query = normalizedSearchQuery.value
    filtered = filtered.filter((log) => {
      return log.messageLower.includes(query) || log.tagLower.includes(query)
    })
  }

  return filtered
})

const hasActiveFilters = computed(() =>
  Boolean(
    normalizedSearchQuery.value ||
    selectedLevels.value.length ||
    selectedTags.value.length,
  ),
)

// Summarize the loaded window, rather than implying a count of the full archive.
const logSummary = computed(() => {
  let errors = 0
  let warnings = 0
  for (const log of logs.value) {
    const type = log.type || getLevelType(log.level)
    if (type === 'error') errors++
    if (type === 'warn') warnings++
  }
  const first = logs.value[0]?.date
  const last = logs.value.at(-1)?.date
  const hasTimeRange = Boolean(
    first &&
    last &&
    Number.isFinite(Date.parse(first)) &&
    Number.isFinite(Date.parse(last)),
  )
  return { errors, warnings, first, last, hasTimeRange }
})

const availableTags = computed(() => {
  const tags = new Set<string>()
  for (const log of logs.value) {
    if (log.tag) {
      tags.add(log.tag)
    }
  }

  return Array.from(tags)
    .sort((a, b) => a.localeCompare(b))
    .map((tag) => ({
      label: tag,
      value: tag,
    }))
})

const tagMeasureContext = shallowRef<CanvasRenderingContext2D | null>(null)
const timeColumnWidth = computed(() => {
  const width = tagMeasureContext.value?.measureText('23:59:59.999').width ?? 96
  return `${Math.ceil(width) + 16}px`
})
const tagColumnWidth = computed(() => {
  const context = tagMeasureContext.value
  let width = 0
  for (const tag of availableTags.value) {
    // The fallback also reserves enough room for full-width characters.
    const measured = context
      ? context.measureText(tag.value).width
      : Array.from(tag.value).length * 12
    width = Math.max(width, measured)
  }
  return `${Math.ceil(width) + 16}px`
})

const totalVirtualHeight = computed(
  () => filteredLogs.value.length * ROW_HEIGHT + VIRTUAL_BOTTOM_PADDING,
)

const virtualStart = computed(() => {
  const start = Math.floor(scrollTop.value / ROW_HEIGHT) - VIRTUAL_OVERSCAN
  return Math.max(0, start)
})

const virtualEnd = computed(() => {
  const visibleCount =
    Math.ceil(containerHeight.value / ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
  return Math.min(
    filteredLogs.value.length,
    virtualStart.value + Math.max(visibleCount, 1),
  )
})

const virtualOffset = computed(() => virtualStart.value * ROW_HEIGHT)

const visibleLogs = computed(() => {
  return filteredLogs.value.slice(virtualStart.value, virtualEnd.value)
})

// 映射日志级别到 UBadge 颜色
const getBadgeColor = (
  level: string,
):
  | 'error'
  | 'info'
  | 'success'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'neutral' => {
  const colorMap: Record<
    string,
    | 'error'
    | 'info'
    | 'success'
    | 'primary'
    | 'secondary'
    | 'warning'
    | 'neutral'
  > = {
    error: 'error',
    warn: 'warning',
    info: 'info',
    success: 'success',
    debug: 'neutral',
  }
  return colorMap[level] || 'info'
}

// 获取日志行样式
const getLogLineStyle = (log: LogEntry) => {
  const baseStyle = 'hover:bg-neutral-200 dark:hover:bg-neutral-800'
  const logType = log.type || getLevelType(log.level)
  const levelStyles = {
    error: 'text-red-500 dark:text-red-400 border-l-2 border-red-500 font-bold',
    warn: 'text-yellow-500 dark:text-yellow-400 border-l-2 border-yellow-500 font-bold',
    info: 'text-neutral-400 dark:text-neutral-300 border-l-2 border-blue-500',
    success: 'text-green-500 dark:text-green-400 border-l-2 border-green-500',
    debug:
      'text-neutral-300 dark:text-neutral-400 border-l-2 border-neutral-500',
  }
  return `${baseStyle} ${levelStyles[logType as keyof typeof levelStyles] || levelStyles.info} border-none`
}

// 获取连接状态样式
const getConnectionStatusClass = () => {
  if (connectionState.value === 'live') {
    return 'text-success'
  } else if (
    connectionState.value === 'connecting' ||
    connectionState.value === 'loadingHistory'
  ) {
    return 'text-info'
  } else if (connectionState.value === 'error') {
    return 'text-error'
  }
  return 'text-warning'
}

const getConnectionStatusColor = ():
  | 'error'
  | 'info'
  | 'success'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'neutral' => {
  if (connectionState.value === 'live') {
    return 'success'
  }
  if (
    connectionState.value === 'connecting' ||
    connectionState.value === 'loadingHistory'
  ) {
    return 'info'
  }
  if (connectionState.value === 'error') {
    return 'error'
  }
  return 'warning'
}

// 高亮搜索结果
const highlightSearch = (content: string) => {
  if (!normalizedSearchQuery.value) return content

  const query = normalizedSearchQuery.value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  ) // 转义特殊字符
  const regex = new RegExp(`(${query})`, 'gi')
  return content.replace(
    regex,
    '<mark class="bg-yellow-300 dark:bg-yellow-700 text-black dark:text-white rounded">$1</mark>',
  )
}

// 切换自动滚动
const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value
  if (autoScroll.value) {
    void scrollToBottom('smooth')
  }
}

// 滚动到底部
const scrollToBottom = async (behavior: ScrollBehavior = 'instant') => {
  await nextTick()
  if (logContainer.value && autoScroll.value && !disposed) {
    const top = Math.max(
      0,
      logContainer.value.scrollHeight - logContainer.value.clientHeight,
    )
    smoothScrollTarget = behavior === 'smooth' ? top : null
    if (behavior !== 'smooth') scrollTop.value = top
    logContainer.value.scrollTo({ top, behavior })
  }
}

// 处理滚动事件
const handleScroll = () => {
  if (!logContainer.value) return

  const {
    scrollTop: currentScrollTop,
    scrollHeight,
    clientHeight,
  } = logContainer.value
  const previousTop = scrollTop.value
  scrollTop.value = currentScrollTop
  containerHeight.value = clientHeight
  // Animation frames are programmatic scrolling, not upward history navigation.
  if (smoothScrollTarget !== null) {
    if (Math.abs(currentScrollTop - smoothScrollTarget) <= 1)
      smoothScrollTarget = null
    else return
  }
  if (
    isInitialLoading.value ||
    isPositioningInitialLogs ||
    isLoadingOlder.value
  )
    return
  const isNearBottom = currentScrollTop + clientHeight >= scrollHeight - 50 // 距离底部50px以内
  const isAtTop = currentScrollTop + clientHeight < scrollHeight - 200 // 距离底部200px以上

  // 如果滚动到接近底部，自动开启自动滚动
  if (isNearBottom && !autoScroll.value) {
    autoScroll.value = true
  }
  // 如果用户手动滚动到较高位置，暂停自动滚动
  else if (isAtTop && autoScroll.value) {
    autoScroll.value = false
  }

  if (
    currentScrollTop < previousTop &&
    currentScrollTop <= HISTORY_LOAD_THRESHOLD &&
    !autoScroll.value
  ) {
    void loadOlderLogs()
  }
}

// History and live delivery share byte cursors, so writes during the fetch are retained.
const appendLines = (lines: string[]) => {
  const entries = lines
    .map(parseLogLine)
    .filter((entry): entry is LogEntry => entry !== null)
  logs.value = [...logs.value, ...entries].slice(-MAX_LOG_LINES)
  if (autoScroll.value) void scrollToBottom('smooth')
}

const openLiveStream = () => {
  if (disposed) return
  connectionState.value = 'connecting'
  eventSource?.close()
  const source = new EventSource(
    `/api/system/logs?stream=1&offset=${liveOffset}&identity=${encodeURIComponent(fileIdentity)}`,
  )
  eventSource = source
  source.onopen = () => {
    if (source !== eventSource || disposed) return
    isConnected.value = true
    connectionState.value = 'live'
  }
  source.addEventListener('logs', (event) => {
    if (source !== eventSource || disposed) return
    const batch = JSON.parse((event as MessageEvent).data) as LogPage
    liveOffset = batch.offset
    fileIdentity = batch.identity
    appendLines(batch.lines)
  })
  source.addEventListener('reset', () => {
    if (source !== eventSource || disposed) return
    void connectLogStream()
  })
  const retry = () => {
    if (source !== eventSource || disposed) return
    source.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    isConnected.value = false
    connectionState.value = 'error'
    reconnectTimer = setTimeout(openLiveStream, 2000)
  }
  source.addEventListener('failure', retry)
  source.onerror = retry
}

const connectLogStream = async () => {
  eventSource?.close()
  eventSource = null
  if (reconnectTimer) clearTimeout(reconnectTimer)
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  isInitialLoading.value = true
  isPositioningInitialLogs = true
  isConnected.value = false
  connectionState.value = 'loadingHistory'
  try {
    const page = await $fetch<LogPage>('/api/system/logs', {
      signal: controller.signal,
    })
    if (controller.signal.aborted || disposed) return
    autoScroll.value = true
    logs.value = page.lines
      .map(parseLogLine)
      .filter((entry): entry is LogEntry => entry !== null)
    historyCursor.value = page.before
    liveOffset = page.offset
    fileIdentity = page.identity
    // Remove the loading hint before measuring the final viewport height.
    isInitialLoading.value = false
    await scrollToBottom()
    if (controller.signal.aborted || disposed) return
    openLiveStream()
  } catch {
    if (!controller.signal.aborted && !disposed) connectionState.value = 'error'
  } finally {
    if (requestController === controller) {
      isInitialLoading.value = false
      isPositioningInitialLogs = false
    }
  }
}

const loadOlderLogs = async () => {
  if (
    isInitialLoading.value ||
    isLoadingOlder.value ||
    !historyCursor.value ||
    logs.value.length >= MAX_LOG_LINES
  )
    return
  const controller = requestController
  let loaded = false
  isLoadingOlder.value = true
  autoScroll.value = false
  try {
    const page = await $fetch<LogPage>('/api/system/logs', {
      query: { before: historyCursor.value, identity: fileIdentity },
      signal: controller?.signal,
    })
    if (controller !== requestController || disposed) return
    const previousTop = logContainer.value?.scrollTop ?? 0
    const previousVisibleCount = filteredLogs.value.length
    const entries = page.lines
      .map(parseLogLine)
      .filter((entry): entry is LogEntry => entry !== null)
    const capacity = Math.max(0, MAX_LOG_LINES - logs.value.length)
    const added = capacity > 0 ? entries.slice(-capacity) : []
    logs.value = [...added, ...logs.value]
    historyCursor.value = page.before
    // Update the virtual range in the same render as the prepend. Count only rows
    // that pass the current filters so the visible log retains its pixel position.
    const restoredTop =
      previousTop +
      (filteredLogs.value.length - previousVisibleCount) * ROW_HEIGHT
    scrollTop.value = restoredTop
    await nextTick()
    if (controller !== requestController || disposed) return
    logContainer.value?.scrollTo({ top: restoredTop, behavior: 'instant' })
    loaded = true
  } catch {
    if (!controller?.signal.aborted && !disposed)
      connectionState.value = 'error'
  } finally {
    isLoadingOlder.value = false
  }
  // Filtered or short pages may leave the viewport near the top without a new
  // scroll event. Continue prefetching until there is enough visible history.
  if (
    loaded &&
    !autoScroll.value &&
    (logContainer.value?.scrollTop ?? Infinity) <= HISTORY_LOAD_THRESHOLD
  ) {
    void loadOlderLogs()
  }
}

watch(
  [selectedLevels, selectedTags, searchQuery],
  () => {
    if (autoScroll.value) {
      scrollToBottom()
    }
  },
  { deep: true },
)

onMounted(() => {
  if (logContainer.value) {
    const context = document.createElement('canvas').getContext('2d')
    if (context) {
      const fontSize =
        parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.75
      context.font = `${fontSize}px ${getComputedStyle(logContainer.value).fontFamily}`
      tagMeasureContext.value = context
    }
    containerHeight.value = logContainer.value.clientHeight
  }

  if (typeof ResizeObserver !== 'undefined' && logContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const [entry] = entries
      if (!entry) return
      containerHeight.value = entry.contentRect.height
    })
    resizeObserver.observe(logContainer.value)
  }

  connectLogStream()
})

onUnmounted(() => {
  disposed = true
  requestController?.abort()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (eventSource) {
    eventSource.close()
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="$t('title.logs')" />
    </template>

    <template #body>
      <div
        class="flex flex-col flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-950 rounded-md relative"
      >
        <div
          class="px-4 py-3 border-b border-neutral-300/80 dark:border-neutral-900 bg-linear-to-r from-neutral-50 to-neutral-100/60 dark:from-neutral-900 dark:to-neutral-950/80"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <UIcon
                  name="tabler:file-text"
                  class="w-4 h-4 text-blue-500"
                />
                <h2
                  class="text-sm sm:text-base font-semibold text-blue-600 tracking-wide"
                >
                  app.log
                </h2>
                <UBadge
                  v-if="connectionState !== 'idle'"
                  size="sm"
                  variant="soft"
                  :color="getConnectionStatusColor()"
                >
                  {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
                </UBadge>
              </div>
              <div
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400"
              >
                <span>{{
                  $t('dashboard.logs.loadedCount', { count: logs.length })
                }}</span>
                <span v-if="hasActiveFilters">{{
                  $t('dashboard.logs.matchedCount', {
                    count: filteredLogs.length,
                  })
                }}</span>
                <span :class="{ 'text-error': logSummary.errors > 0 }">{{
                  $t('dashboard.logs.errorCount', { count: logSummary.errors })
                }}</span>
                <span :class="{ 'text-warning': logSummary.warnings > 0 }">{{
                  $t('dashboard.logs.warningCount', {
                    count: logSummary.warnings,
                  })
                }}</span>
                <span v-if="logSummary.hasTimeRange">{{
                  $t('dashboard.logs.timeRange', {
                    start: $dayjs(logSummary.first).format(
                      'YYYY-MM-DD HH:mm:ss',
                    ),
                    end: $dayjs(logSummary.last).format('YYYY-MM-DD HH:mm:ss'),
                  })
                }}</span>
              </div>
            </div>
            <span
              v-if="connectionState !== 'idle'"
              :class="[
                'text-xs font-medium hidden sm:inline',
                getConnectionStatusClass(),
              ]"
            >
              {{ $t('dashboard.logs.connectionStatus.' + connectionState) }}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <!-- Search -->
            <UInput
              v-model="searchQuery"
              :placeholder="$t('dashboard.logs.search.placeholder')"
              size="sm"
              class="w-full sm:w-56 md:w-64"
              icon="tabler:search"
              :ui="{ trailing: 'pe-1' }"
            >
              <template
                v-if="searchQuery?.length"
                #trailing
              >
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  icon="tabler:x"
                  :aria-label="$t('dashboard.logs.search.clearAriaLabel')"
                  @click="searchQuery = ''"
                />
              </template>
            </UInput>
            <!-- Log level -->
            <USelect
              v-model="selectedLevels"
              :items="
                logLevels.map((level) => ({
                  label: level.toUpperCase(),
                  value: level,
                }))
              "
              multiple
              size="sm"
              :placeholder="$t('dashboard.logs.filter.levelPlaceholder')"
              class="w-28"
              :clearable="false"
            />
            <USelect
              v-model="selectedTags"
              :items="availableTags"
              multiple
              size="sm"
              :placeholder="$t('dashboard.logs.filter.tagPlaceholder')"
              class="w-40 sm:w-52"
              :clearable="false"
            />
            <!-- Auto scroll -->
            <UButton
              icon="tabler:arrow-bar-to-down"
              color="neutral"
              size="sm"
              :variant="autoScroll ? 'outline' : 'soft'"
              class="ms-auto sm:ms-0"
              @click="toggleAutoScroll"
            />
            <UButton
              v-if="connectionState === 'error'"
              icon="tabler:refresh"
              color="neutral"
              size="sm"
              @click="connectLogStream"
            />
          </div>
        </div>
        <div
          v-if="isInitialLoading"
          class="px-4 py-2 text-sm text-neutral-500"
          role="status"
        >
          <UIcon
            name="tabler:loader-2"
            class="animate-spin mr-2"
          />
          {{ $t('dashboard.logs.connectionStatus.loadingHistory') }}
        </div>

        <div
          ref="logContainer"
          class="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto font-mono text-sm relative"
          style="overflow-anchor: none"
          :style="{
            '--log-tag-width': tagColumnWidth,
            '--log-time-width': timeColumnWidth,
          }"
          @scroll="handleScroll"
          @wheel.passive="cancelSmoothScroll"
          @touchstart.passive="cancelSmoothScroll"
          @pointerdown="cancelSmoothScroll"
          @keydown="cancelSmoothScroll"
        >
          <div
            v-if="isLoadingOlder"
            class="sticky top-0 h-0 z-10 flex justify-center pointer-events-none"
            role="status"
          >
            <UIcon
              name="tabler:loader-2"
              class="animate-spin mt-2 text-blue-500"
              :aria-label="$t('dashboard.logs.connectionStatus.loadingHistory')"
            />
          </div>
          <div
            class="relative"
            :style="{ height: `${totalVirtualHeight}px` }"
          >
            <div
              class="absolute left-0 w-max min-w-full"
              :style="{ transform: `translateY(${virtualOffset}px)` }"
            >
              <div
                v-for="(log, index) in visibleLogs"
                :key="`${virtualStart + index}-${log.raw}`"
                :class="[
                  'group log-row grid items-center',
                  getLogLineStyle(log),
                ]"
                :style="{ height: `${ROW_HEIGHT}px` }"
              >
                <!-- 时间戳 -->
                <span
                  class="log-time log-fixed-cell text-neutral-400 dark:text-neutral-500 text-xs whitespace-nowrap"
                >
                  {{ $dayjs(log.date).format('HH:mm:ss.SSS') }}
                </span>

                <!-- 日志级别 -->
                <div class="log-level log-fixed-cell">
                  <UBadge
                    class="shrink-0"
                    size="sm"
                    :variant="log.level <= 1 ? 'solid' : 'soft'"
                    :color="getBadgeColor(log.type || getLevelType(log.level))"
                  >
                    {{
                      (log.type || getLevelType(log.level))
                        .toUpperCase()
                        .slice(0, 4)
                    }}
                  </UBadge>
                </div>

                <!-- 日志内容 -->
                <div class="px-2 min-w-0">
                  <span
                    v-if="normalizedSearchQuery"
                    class="block whitespace-nowrap"
                    v-html="highlightSearch(log.message)"
                  ></span>
                  <span
                    v-else
                    class="block whitespace-nowrap"
                  >
                    {{ log.message }}
                  </span>
                </div>

                <!-- 标签 -->
                <span
                  class="log-tag log-fixed-cell text-xs whitespace-nowrap text-neutral-400/80"
                  :title="log.tag"
                >
                  {{ log.tag }}
                </span>
              </div>
            </div>

            <!-- 空状态 -->
            <div
              v-if="filteredLogs.length === 0"
              class="text-center py-8 text-gray-500 dark:text-gray-400 absolute inset-0"
            >
              <div v-if="logs.length === 0">
                {{ $t('dashboard.logs.empty.waiting') }}
              </div>
              <div v-else>{{ $t('dashboard.logs.empty.noMatch') }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* The shared horizontal scroll moves messages while metadata stays pinned. */
.log-row {
  --log-level-width: 3.5rem;
  grid-template-columns:
    var(--log-time-width) var(--log-level-width) minmax(6rem, 1fr)
    var(--log-tag-width);
}

.log-fixed-cell {
  position: sticky;
  z-index: 1;
  height: 100%;
  align-content: center;
  padding-inline: 0.5rem;
  background: var(--color-neutral-100);
}

:global(.dark) .log-fixed-cell {
  background: var(--color-neutral-950);
}

.log-row:hover .log-fixed-cell {
  background: var(--color-neutral-200);
}

:global(.dark) .log-row:hover .log-fixed-cell {
  background: var(--color-neutral-800);
}

.log-time {
  left: 0;
}
.log-level {
  left: var(--log-time-width);
}
.log-tag {
  right: 0;
  text-align: right;
}

@media (width < 640px) {
  .log-row {
    --log-level-width: 3rem;
  }
  .log-fixed-cell {
    padding-inline: 0.25rem;
  }
  .log-level,
  .log-tag {
    position: static;
    left: auto;
    right: auto;
    z-index: auto;
  }
}

/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: color-mix(in oklab, var(--ui-color-neutral-200) 50%, transparent);
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--ui-color-neutral-400) 50%, transparent);
  border-radius: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklab, var(--ui-color-neutral-600) 50%, transparent);
}

mark {
  border-radius: 2px;
  padding: 0 2px;
}
</style>
