<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

interface UploadFile {
  file: File
  fileName: string
  fileId: string
  status:
    | 'waiting'
    | 'preparing'
    | 'uploading'
    | 'processing'
    | 'completed'
    | 'error'
    | 'skipped'
    | 'blocked'
  stage?: string | null
  progress?: number
  error?: string
  taskId?: number
  uploadProgress?: {
    loaded: number
    total: number
    percentage: number
    speed?: number
    timeRemaining?: number
    speedText?: string
    timeRemainingText?: string
  }
  canAbort?: boolean
  abortUpload?: () => void
}

const props = defineProps<{
  uploadingFiles: Map<string, UploadFile>
  collapsed?: boolean
}>()

const emit = defineEmits<{
  removeFile: [fileId: string]
  clearCompleted: []
  clearAll: []
  toggle: []
  goToQueue: []
}>()

const isCollapsed = ref(props.collapsed || false)

// 计算统计信息
const stats = computed(() => {
  const files = Array.from(props.uploadingFiles.values())
  return {
    total: files.length,
    waiting: files.filter((f) => f.status === 'waiting').length,
    uploading: files.filter((f) => f.status === 'uploading').length,
    processing: files.filter((f) => f.status === 'processing').length,
    completed: files.filter((f) => f.status === 'completed').length,
    error: files.filter((f) => f.status === 'error').length,
    skipped: files.filter((f) => f.status === 'skipped').length,
    blocked: files.filter((f) => f.status === 'blocked').length,
    active: files.filter(
      (f) => f.status === 'uploading' || f.status === 'processing',
    ).length,
    pending: files.filter(
      (f) => f.status === 'waiting' || f.status === 'preparing',
    ).length,
  }
})

// 计算整体进度
const overallProgress = computed(() => {
  const files = Array.from(props.uploadingFiles.values())
  if (files.length === 0) return 0

  let totalProgress = 0
  files.forEach((file) => {
    if (file.status === 'completed') {
      // 完成状态：100%
      totalProgress += 100
    } else if (file.status === 'uploading' && file.progress !== undefined) {
      // 上传中：上传进度 * 0.7（上传占总进度的70%）
      totalProgress += file.progress * 0.7
    } else if (file.status === 'processing') {
      // 处理中：上传完成(70%)
      totalProgress += 70
    } else if (file.status === 'preparing') {
      // 准备中：0%
      totalProgress += 0
    } else if (file.status === 'waiting') {
      // 等待状态：0%
      totalProgress += 0
    } else if (file.status === 'skipped' || file.status === 'blocked') {
      // 跳过或被阻止：0%（不参与进度计算）
      totalProgress += 0
    }
  })

  return Math.round(totalProgress / files.length)
})

// 计算状态颜色
const statusColor = computed(() => {
  if (stats.value.error > 0 || stats.value.blocked > 0) return 'error'
  if (stats.value.active > 0) return 'primary'
  if (stats.value.skipped > 0 && stats.value.active === 0) return 'warning'
  if (stats.value.completed > 0 && stats.value.active === 0) return 'success'
  return 'neutral'
})

// 切换折叠状态
const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
  emit('toggle')
}

// 清除已完成的文件
const clearCompletedFiles = () => {
  emit('clearCompleted')
}

// 清除所有文件
const clearAllFiles = () => {
  emit('clearAll')
}

// 统一的完成处理逻辑，避免重复通知
</script>

<template>
  <div
    v-if="uploadingFiles.size > 0"
    class="fixed bottom-2 inset-x-2 sm:inset-x-6 sm:bottom-6 sm:left-auto z-50 min-w-sm sm:w-md"
  >
    <motion.div
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden"
      :initial="{ opacity: 0, y: 100, scale: 0.9 }"
      :animate="{ opacity: 1, y: 0, scale: 1 }"
      :exit="{ opacity: 0, y: 100, scale: 0.9 }"
      :transition="{ duration: 0.4, ease: 'backOut' }"
      layout
    >
      <!-- 头部 -->
      <motion.div
        class="p-4 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer"
        :while-hover="{ backgroundColor: 'rgba(0,0,0,0.02)' }"
        :while-tap="{ scale: 0.98 }"
        @click="toggleCollapsed"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <!-- 状态指示器 -->
            <Icon
              :name="
                {
                  primary: 'tabler:upload',
                  success: 'tabler:circle-check',
                  error: 'tabler:alert-circle',
                  warning: 'tabler:alert-triangle',
                  neutral: 'tabler:info-circle',
                }[statusColor]
              "
              class="size-5"
              :class="{
                'text-blue-600 dark:text-blue-400': statusColor === 'primary',
                'text-green-600 dark:text-green-400': statusColor === 'success',
                'text-red-600 dark:text-red-400': statusColor === 'error',
                'text-yellow-600 dark:text-yellow-400': statusColor === 'warning',
                'text-neutral-600 dark:text-neutral-400':
                  statusColor === 'neutral',
              }"
            />

            <!-- 标题和统计 -->
            <div>
              <h3
                class="font-semibold text-sm text-neutral-900 dark:text-neutral-100"
              >
                文件上传队列
                <span class="text-neutral-500 dark:text-neutral-400">
                  ({{ stats.total }})
                </span>
              </h3>

              <div
                class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-1"
              >
                <span
                  v-if="stats.waiting > 0"
                  class="text-neutral-600 dark:text-neutral-400"
                >
                  {{ stats.waiting }} 等待
                </span>
                <span
                  v-if="stats.active > 0"
                  class="text-blue-600 dark:text-blue-400"
                >
                  {{ stats.active }} 进行中
                </span>
                <span
                  v-if="stats.completed > 0"
                  class="text-green-600 dark:text-green-400"
                >
                  {{ stats.completed }} 完成
                </span>
                <span
                  v-if="stats.error > 0"
                  class="text-red-600 dark:text-red-400"
                >
                  {{ stats.error }} 失败
                </span>
                <span
                  v-if="stats.skipped > 0"
                  class="text-yellow-600 dark:text-yellow-400"
                >
                  {{ stats.skipped }} 跳过
                </span>
                <span
                  v-if="stats.blocked > 0"
                  class="text-red-600 dark:text-red-400"
                >
                  {{ stats.blocked }} 被阻止
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- 整体进度 -->
            <div
              v-if="stats.active > 0"
              class="text-xs text-neutral-500 dark:text-neutral-400 font-mono"
            >
              {{ overallProgress }}%
            </div>

            <!-- 折叠图标 -->
            <motion.div
              :animate="{ rotate: isCollapsed ? 0 : 180 }"
              :transition="{ duration: 0.3 }"
            >
              <Icon
                name="tabler:chevron-down"
                class="size-5 text-neutral-500 dark:text-neutral-400 block"
              />
            </motion.div>
          </div>
        </div>

        <!-- 整体进度条 -->
        <motion.div
          v-if="stats.active > 0"
          class="mt-3"
          :initial="{ opacity: 0, scaleX: 0 }"
          :animate="{ opacity: 1, scaleX: 1 }"
          :exit="{ opacity: 0, scaleX: 0 }"
          :transition="{ duration: 0.3 }"
          style="transform-origin: left"
        >
          <UProgress
            :model-value="overallProgress"
            :color="statusColor"
          />
        </motion.div>
      </motion.div>

      <!-- 文件列表 -->
      <AnimatePresence>
        <motion.div
          v-if="!isCollapsed"
          :initial="{ height: 0, opacity: 0 }"
          :animate="{ height: 'auto', opacity: 1 }"
          :exit="{ height: 0, opacity: 0 }"
          :transition="{ duration: 0.3, ease: 'easeInOut' }"
          class="max-h-[calc(100vh-25.3rem)] sm:max-h-[600px] overflow-hidden overflow-y-auto filelist-container"
        >
          <div class="p-2 space-y-2">
            <AnimatePresence mode="popLayout">
              <UploadQueueItem
                v-for="[fileId, uploadingFile] in uploadingFiles"
                :key="fileId"
                :uploading-file="uploadingFile"
                :file-id="fileId"
                @remove-file="emit('removeFile', $event)"
              />
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      <!-- 底部操作栏 -->
      <AnimatePresence>
        <motion.div
          v-if="!isCollapsed && (stats.completed > 0 || stats.error > 0)"
          :initial="{ opacity: 0, scaleY: 0 }"
          :animate="{ opacity: 1, scaleY: 1 }"
          :exit="{ opacity: 0, scaleY: 0 }"
          :transition="{ duration: 0.3 }"
          style="transform-origin: bottom"
          class="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ stats.completed }} 完成, {{ stats.error }} 失败
            </div>

            <div class="flex items-center gap-0.5">
              <UButton
                v-if="stats.completed > 0"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="clearCompletedFiles"
              >
                清除已完成
              </UButton>

              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="tabler:trash"
                @click="clearAllFiles"
              >
                清除全部
              </UButton>
              
              <UButton
                size="xs"
                variant="ghost"
                color="info"
                icon="tabler:list-check"
                @click="emit('goToQueue')"
              >
                队列管理
              </UButton>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  </div>
</template>

<style scoped>
/* 滚动条样式 */
.filelist-container::-webkit-scrollbar {
  width: 4px;
}

.filelist-container::-webkit-scrollbar-track {
  background: transparent;
}

.filelist-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.dark .filelist-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}
</style>
