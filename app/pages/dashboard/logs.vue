<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

interface LogEntry {
  date: string
  args: string[]
  type: string
  level: number
  tag: string
  timestamp: Date
  raw: string
}

const logs = ref<LogEntry[]>([])
const searchQuery = ref('')
const selectedLevels = ref<string[]>([])
const autoScroll = ref(true)
const isConnected = ref(false)
const connectionStatus = ref('')
const logContainer = ref<HTMLElement>()
const isInitialLoading = ref(false)
const loadingProgress = ref(0)

// 批处理队列
const batchQueue = ref<LogEntry[]>([])
const isBatchProcessing = ref(false)
const BATCH_SIZE = 10 // 每批处理的日志条数
const BATCH_DELAY = 16 // 每批处理间隔（毫秒）

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

// 批处理添加日志
const addLogEntry = (logEntry: LogEntry) => {
  batchQueue.value.push(logEntry)
  if (!isBatchProcessing.value) {
    processBatch()
  }
}

// 处理批队列
const processBatch = async () => {
  if (isBatchProcessing.value || batchQueue.value.length === 0) return

  isBatchProcessing.value = true

  while (batchQueue.value.length > 0) {
    const batch = batchQueue.value.splice(0, BATCH_SIZE)
    logs.value.push(...batch)

    // 限制日志条数，避免内存泄漏
    if (logs.value.length > 10000) {
      logs.value = logs.value.slice(-5000)
    }

    // 更新加载进度（只在初始加载时显示）
    if (isInitialLoading.value) {
      const totalProcessed = logs.value.length
      loadingProgress.value = Math.min(100, (totalProcessed / 512) * 100)
    }

    // 自动滚动到底部
    if (autoScroll.value) {
      await scrollToBottom()
    }

    // 如果还有更多批次，延迟处理以避免阻塞UI
    if (batchQueue.value.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }

  isBatchProcessing.value = false

  // 注意：初始加载完成现在由消息超时检测控制，不在这里处理
}

// 解析日志行
const parseLogLine = (line: string): LogEntry | null => {
  try {
    const logData = JSON.parse(line)
    return {
      date: logData.date,
      args: logData.args || [],
      type: logData.type || 'info',
      level: logData.level || 3,
      tag: logData.tag || '',
      timestamp: new Date(logData.date),
      raw: line,
    }
  } catch (error) {
    // 如果解析失败，创建一个fallback日志条目
    console.warn('Failed to parse log line:', line, error)
    return {
      date: new Date().toISOString(),
      args: [line],
      type: 'info',
      level: 3,
      tag: 'fallback',
      timestamp: new Date(),
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

  // 按搜索词过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter((log) => {
      const content = log.args.join(' ').toLowerCase()
      const tag = log.tag.toLowerCase()
      return content.includes(query) || tag.includes(query)
    })
  }

  return filtered
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
  if (connectionStatus.value.includes('实时')) {
    return 'text-success'
  } else if (connectionStatus.value.includes('连接')) {
    return 'text-info'
  } else if (connectionStatus.value.includes('错误')) {
    return 'text-error'
  }
  return 'text-warning'
}

// 高亮搜索结果
const highlightSearch = (content: string) => {
  if (!searchQuery.value.trim()) return content

  const query = searchQuery.value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
  const regex = new RegExp(`(${query})`, 'gi')
  return content.replace(
    regex,
    '<mark class="bg-yellow-300 dark:bg-yellow-700 text-black dark:text-white rounded">$1</mark>',
  )
}

// 格式化日志参数
const formatLogArgs = (args: string[]) => {
  return args.join(' ')
}

// 切换自动滚动
const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value
  if (autoScroll.value) {
    scrollToBottom()
  }
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

// 处理滚动事件
const handleScroll = () => {
  if (!logContainer.value) return

  const { scrollTop, scrollHeight, clientHeight } = logContainer.value
  const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50 // 距离底部50px以内
  const isAtTop = scrollTop + clientHeight < scrollHeight - 200 // 距离底部200px以上

  // 如果滚动到接近底部，自动开启自动滚动
  if (isNearBottom && !autoScroll.value) {
    autoScroll.value = true
  }
  // 如果用户手动滚动到较高位置，暂停自动滚动
  else if (isAtTop && autoScroll.value) {
    autoScroll.value = false
  }
}

// 连接日志流
const connectLogStream = () => {
  if (eventSource) {
    eventSource.close()
  }

  // 重置状态
  logs.value = []
  batchQueue.value = []
  isInitialLoading.value = true
  loadingProgress.value = 0

  connectionStatus.value = '正在连接...'
  eventSource = new EventSource('/api/system/logs')

  let initialLoadCompleteTimer: NodeJS.Timeout | null = null
  const MESSAGE_TIMEOUT = 2000 // 消息间隔超时时间（毫秒）

  eventSource.onopen = () => {
    isConnected.value = true
    connectionStatus.value = '加载历史日志...'
  }

  eventSource.onmessage = (event) => {
    const logLine = event.data
    if (logLine && logLine.trim()) {
      const logEntry = parseLogLine(logLine)
      if (logEntry) {
        // 清除之前的定时器
        if (initialLoadCompleteTimer) {
          clearTimeout(initialLoadCompleteTimer)
          initialLoadCompleteTimer = null
        }

        if (isInitialLoading.value) {
          addLogEntry(logEntry)

          // 设置新的定时器，如果在指定时间内没有新消息，认为初始加载完成
          initialLoadCompleteTimer = setTimeout(() => {
            if (isInitialLoading.value) {
              connectionStatus.value = '实时'
              // 让加载指示器显示完成状态后再隐藏
              setTimeout(() => {
                isInitialLoading.value = false
                loadingProgress.value = 0
                toggleAutoScroll()
              }, 500)
            }
          }, MESSAGE_TIMEOUT)
        } else {
          // 实时日志直接添加
          addLogEntry(logEntry)
        }
      }
    }
  }

  eventSource.onerror = (error) => {
    isConnected.value = false
    connectionStatus.value = '连接错误'
    console.error('EventSource error:', error)
  }
}

watch(
  [selectedLevels, searchQuery],
  () => {
    if (autoScroll.value) {
      scrollToBottom()
    }
  },
  { deep: true },
)

onMounted(() => {
  connectLogStream()
})

onUnmounted(() => {
  if (eventSource) {
    eventSource.close()
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
        class="flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-950 rounded-md relative"
      >
        <div
          class="px-4 py-2 border-b border-neutral-300 dark:border-neutral-900 flex items-center justify-between"
        >
          <div>
            <h2 class="text-lg font-medium text-blue-600">app.log</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              <span
                v-if="connectionStatus"
                :class="getConnectionStatusClass()"
              >
                {{ connectionStatus }}
              </span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <!-- Search -->
            <UInput
              v-model="searchQuery"
              placeholder="搜索日志内容..."
              size="sm"
              class="w-48"
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
                  aria-label="Clear search input"
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
              placeholder="过滤级别"
              class="w-24"
              :clearable="false"
            />
            <!-- Auto scroll -->
            <UButton
              icon="tabler:arrow-bar-to-down"
              color="neutral"
              size="sm"
              :variant="autoScroll ? 'outline' : 'soft'"
              @click="toggleAutoScroll"
            />
            <!-- Download raw log -->
            <!-- TODO: Download raw log file -->
            <!-- <UButton 
            as="a"
            target="_blank"
            rel="noopener"
            icon="tabler:download"
            color="neutral"
            size="sm"
            variant="soft"
          /> -->
          </div>
        </div>
        <!-- 加载进度指示器 -->
        <div
          v-if="isInitialLoading"
          class="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-10"
        >
          <div class="text-center">
            <div class="mb-4">
              <UIcon
                name="tabler:loader-2"
                class="animate-spin w-8 h-8 text-blue-500"
              />
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
              正在加载历史日志...
            </div>
            <div class="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                :style="{ width: `${loadingProgress}%` }"
              ></div>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ Math.round(loadingProgress) }}%
            </div>
          </div>
        </div>

        <div
          ref="logContainer"
          class="h-[calc(100vh-10rem)] overflow-y-auto overflow-x-auto scroll-smooth font-mono text-sm relative"
          @scroll="handleScroll"
        >
          <div class="p-2 space-y-1">
            <div
              v-for="(log, index) in filteredLogs"
              :key="index"
              :class="['px-2 py-0.5 rounded border-l-4', getLogLineStyle(log)]"
            >
              <div class="flex items-start space-x-3 text-sm">
                <!-- 时间戳 -->
                <span
                  class="text-neutral-400 dark:text-neutral-500 text-xs whitespace-nowrap min-w-0 flex-shrink-0 mt-0.5"
                >
                  {{ $dayjs(log.date).format('HH:mm:ss.SSS') }}
                </span>

                <!-- 日志级别 -->
                <UBadge
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

                <!-- 日志内容 -->
                <div class="flex-1 min-w-0">
                  <span
                    class="whitespace-pre-wrap break-words"
                    v-html="highlightSearch(formatLogArgs(log.args))"
                  ></span>
                </div>

                <!-- 标签 -->
                <span
                  v-if="log.tag"
                  class="text-xs whitespace-nowrap flex-shrink-0 truncate text-neutral-400/80"
                >
                  {{ log.tag }}
                </span>
              </div>
            </div>

            <!-- 空状态 -->
            <div
              v-if="filteredLogs.length === 0"
              class="text-center py-8 text-gray-500 dark:text-gray-400"
            >
              <div v-if="logs.length === 0">等待日志数据...</div>
              <div v-else>没有匹配的日志条目</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
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
