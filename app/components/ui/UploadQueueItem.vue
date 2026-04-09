<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'

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
  warning?: string
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
  uploadingFile: UploadFile
  fileId: string
}>()

const emit = defineEmits<{
  removeFile: [fileId: string]
}>()

const fileIcon = computed(() => {
  const file = props.uploadingFile.file
  if (file.type.startsWith('image/')) {
    return 'tabler:photo'
  } else if (file.type.startsWith('video/')) {
    return 'tabler:video'
  }
  return 'tabler:file'
})

const statusColor = computed(() => {
  switch (props.uploadingFile.status) {
    case 'waiting':
      return 'neutral'
    case 'preparing':
      return 'primary'
    case 'uploading':
      return 'primary'
    case 'processing':
      return 'info'
    case 'completed':
      return 'success'
    case 'error':
      return 'error'
    case 'skipped':
      return 'warning'
    case 'blocked':
      return 'error'
    default:
      return 'neutral'
  }
})

const statusText = computed(() => {
  switch (props.uploadingFile.status) {
    case 'waiting':
      return '等待上传'
    case 'preparing':
      return '准备中'
    case 'uploading':
      return `上传中 ${props.uploadingFile.progress || 0}%`
    case 'processing':
      return props.uploadingFile.stage
        ? getStageText(props.uploadingFile.stage)
        : '等待处理'
    case 'completed':
      return '完成'
    case 'error':
      return '错误'
    case 'skipped':
      return '已跳过'
    case 'blocked':
      return '被阻止'
    default:
      return '未知'
  }
})

// 获取处理阶段文本
const getStageText = (stage: string) => {
  const stageMap: Record<string, string> = {
    preprocessing: '预处理中',
    metadata: '提取元数据',
    thumbnail: '生成缩略图',
    exif: '处理 EXIF',
    'reverse-geocoding': '地理解析',
    'live-photo': '检测 LivePhoto',
  }
  return stageMap[stage] || stage
}

// 文件大小格式化
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 处理完成粒子动画
const showParticles = ref(false)
const particleCount = 12

// 处理时间警告
const showProcessingWarning = ref(false)
const processingStartTime = ref<number | null>(null)
let processingTimer: NodeJS.Timeout | null = null

watch(
  () => props.uploadingFile.status,
  async (newStatus, oldStatus) => {
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      await nextTick()
      // 延迟触发粒子动画，让完成指示器先显示
      setTimeout(() => {
        showParticles.value = true
        // 2秒后隐藏粒子
        setTimeout(() => {
          showParticles.value = false
        }, 2000)
      }, 300)
    }

    // 处理状态变化时的时间跟踪
    if (newStatus === 'processing' && oldStatus !== 'processing') {
      // 开始处理，记录时间
      processingStartTime.value = Date.now()
      showProcessingWarning.value = false

      // 30秒后显示警告
      processingTimer = setTimeout(() => {
        if (props.uploadingFile.status === 'processing') {
          showProcessingWarning.value = true
        }
      }, 30000)
    } else if (oldStatus === 'processing' && newStatus !== 'processing') {
      // 处理结束，清理定时器和状态
      if (processingTimer) {
        clearTimeout(processingTimer)
        processingTimer = null
      }
      showProcessingWarning.value = false
      processingStartTime.value = null
    }
  },
)

// 组件卸载时清理定时器
onUnmounted(() => {
  if (processingTimer) {
    clearTimeout(processingTimer)
  }
})

const generateParticleStyle = (index: number) => {
  const angle = (360 / particleCount) * index
  const distance = 60 + Math.random() * 40 // 60-100px的随机距离
  const duration = 1.5 + Math.random() * 0.5 // 1.5-2s的随机持续时间

  return {
    '--angle': `${angle}deg`,
    '--distance': `${distance}px`,
    '--duration': `${duration}s`,
    '--delay': `${Math.random() * 0.3}s`,
  }
}
</script>

<template>
  <motion.div
    class="bg-white dark:bg-neutral-800 rounded-lg p-3 shadow-sm border border-neutral-200 dark:border-neutral-700"
    :initial="{ opacity: 0, scale: 0.95, y: 20 }"
    :animate="{ opacity: 1, scale: 1, y: 0 }"
    :exit="{ opacity: 0, scale: 0.95, y: -20 }"
    :transition="{ duration: 0.3, ease: 'easeOut' }"
    layout
  >
    <!-- 文件信息头部 -->
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <!-- 文件图标 -->
        <motion.div
          class="relative shrink-0"
          :transition="{
            duration: uploadingFile.status === 'processing' ? 2 : 0.3,
            repeat: uploadingFile.status === 'processing' ? Infinity : 0,
            ease: 'linear',
          }"
        >
          <div
            class="w-10 h-10 rounded-lg border flex items-center justify-center"
            :class="{
              'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50':
                statusColor === 'primary' || statusColor === 'info',
              'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800/50':
                statusColor === 'success',
              'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800/50':
                statusColor === 'error',
              'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800/50':
                statusColor === 'warning',
              'bg-neutral-100 dark:bg-neutral-900/30 border-neutral-200 dark:border-neutral-800/50':
                statusColor === 'neutral',
            }"
          >
            <Icon
              :name="fileIcon"
              class="w-5 h-5"
              :class="{
                'text-blue-600/80 dark:text-blue-400/80':
                  statusColor === 'primary' || statusColor === 'info',
                'text-green-600/80 dark:text-green-400/80':
                  statusColor === 'success',
                'text-red-600/80 dark:text-red-400/80': statusColor === 'error',
                'text-yellow-600/80 dark:text-yellow-400/80':
                  statusColor === 'warning',
                'text-neutral-600/80 dark:text-neutral-400/80':
                  statusColor === 'neutral',
              }"
            />
          </div>

          <!-- 完成指示器 -->
          <motion.div
            v-if="uploadingFile.status === 'completed'"
            class="absolute -top-2 -right-2 size-5 bg-green-900 rounded-full border-2 border-white dark:border-neutral-800 flex items-center justify-center"
            :initial="{ scale: 0 }"
            :animate="{ scale: 1 }"
            :transition="{ delay: 0.2, duration: 0.3, ease: 'backOut' }"
          >
            <Icon
              name="tabler:check"
              class="size-3 text-white"
            />
          </motion.div>

          <!-- 跳过指示器 -->
          <motion.div
            v-if="uploadingFile.status === 'skipped'"
            class="absolute -top-2 -right-2 size-5 bg-yellow-600 rounded-full border-2 border-white dark:border-neutral-800 flex items-center justify-center"
            :initial="{ scale: 0 }"
            :animate="{ scale: 1 }"
            :transition="{ delay: 0.2, duration: 0.3, ease: 'backOut' }"
          >
            <Icon
              name="tabler:arrow-big-right-lines"
              class="size-3 text-white"
            />
          </motion.div>

          <!-- 阻止指示器 -->
          <motion.div
            v-if="uploadingFile.status === 'blocked'"
            class="absolute -top-2 -right-2 size-5 bg-red-600 rounded-full border-2 border-white dark:border-neutral-800 flex items-center justify-center"
            :initial="{ scale: 0 }"
            :animate="{ scale: 1 }"
            :transition="{ delay: 0.2, duration: 0.3, ease: 'backOut' }"
          >
            <Icon
              name="tabler:cancel"
              class="size-3 text-white"
            />
          </motion.div>

          <!-- 完成粒子动画 -->
          <AnimatePresence>
            <motion.div
              v-if="showParticles && uploadingFile.status === 'completed'"
              class="absolute -top-2 -right-2 size-5 pointer-events-none"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :exit="{ opacity: 0 }"
              :transition="{ duration: 0.2 }"
            >
              <div
                v-for="i in particleCount"
                :key="i"
                class="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full particle-burst"
                :style="generateParticleStyle(i - 1)"
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <!-- 文件信息 -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <p
              class="font-medium text-sm truncate text-neutral-900 dark:text-neutral-100"
            >
              {{ uploadingFile.fileName }}
            </p>
            <UBadge
              :color="statusColor"
              variant="soft"
              size="sm"
            >
              {{ statusText }}
            </UBadge>
          </div>

          <div
            class="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400"
          >
            <span>{{ formatBytes(uploadingFile.file.size) }}</span>
            <span
              v-if="
                uploadingFile.uploadProgress?.speedText &&
                uploadingFile.status === 'uploading'
              "
              class="hidden sm:inline"
            >
              • {{ uploadingFile.uploadProgress.speedText }}
            </span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-2 ml-2">
        <!-- 中止上传按钮 -->
        <motion.div
          v-if="uploadingFile.status === 'uploading' && uploadingFile.canAbort"
          :initial="{ opacity: 0, scale: 0.8 }"
          :animate="{ opacity: 1, scale: 1 }"
          :exit="{ opacity: 0, scale: 0.8 }"
        >
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="tabler:x"
            @click="uploadingFile.abortUpload?.()"
          >
            中止
          </UButton>
        </motion.div>

        <!-- 清除按钮 -->
        <motion.div
          v-if="
            uploadingFile.status === 'completed' ||
            uploadingFile.status === 'error' ||
            uploadingFile.status === 'skipped' ||
            uploadingFile.status === 'blocked'
          "
          :initial="{ opacity: 0, scale: 0.8 }"
          :animate="{ opacity: 1, scale: 1 }"
          :exit="{ opacity: 0, scale: 0.8 }"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="tabler:x"
            @click="emit('removeFile', fileId)"
          >
            清除
          </UButton>
        </motion.div>
      </div>
    </div>

    <!-- 进度条区域 -->
    <AnimatePresence>
      <motion.div
        v-if="
          uploadingFile.status === 'uploading' ||
          uploadingFile.status === 'processing'
        "
        :initial="{ opacity: 0, height: 0 }"
        :animate="{ opacity: 1, height: 'auto' }"
        :exit="{ opacity: 0, height: 0 }"
        :transition="{ duration: 0.3 }"
        class="space-y-2 mt-3"
      >
        <!-- 上传进度 -->
        <div
          v-if="uploadingFile.status === 'uploading'"
          class="space-y-1"
        >
          <div class="flex justify-between items-center">
            <span class="text-xs text-neutral-600 dark:text-neutral-400">
              上传进度
            </span>
            <span
              class="text-xs font-mono text-neutral-600 dark:text-neutral-400"
            >
              {{ uploadingFile.progress }}%
            </span>
          </div>

          <motion.div
            class="relative"
            :initial="{ scaleX: 0 }"
            :animate="{ scaleX: 1 }"
            :transition="{ duration: 0.5 }"
          >
            <UProgress
              :model-value="uploadingFile.progress"
              :color="statusColor"
            />
          </motion.div>

          <div
            v-if="uploadingFile.uploadProgress?.timeRemainingText"
            class="text-xs text-neutral-500 dark:text-neutral-400"
          >
            剩余时间: {{ uploadingFile.uploadProgress.timeRemainingText }}
          </div>
        </div>

        <!-- 处理进度 -->
        <div
          v-if="uploadingFile.status === 'processing'"
          class="space-y-1"
        >
          <div class="flex justify-between items-center">
            <span class="text-xs text-neutral-600 dark:text-neutral-400">
              处理状态
            </span>
            <motion.span
              class="text-xs text-info-600 dark:text-info-400"
              :animate="{ opacity: [0.8, 1, 0.8] }"
              :transition="{ duration: 2, repeat: Infinity }"
            >
              {{ getStageText(uploadingFile.stage || 'pending') }}
            </motion.span>
          </div>

          <UProgress
            :model-value="null"
            animation="swing"
            color="info"
          />
        </div>
      </motion.div>
    </AnimatePresence>

    <!-- 错误信息 -->
    <AnimatePresence>
      <motion.div
        v-if="uploadingFile.status === 'error' && uploadingFile.error"
        :initial="{ opacity: 0, height: 0, y: -10 }"
        :animate="{ opacity: 1, height: 'auto', y: 0 }"
        :exit="{ opacity: 0, height: 0, y: -10 }"
        :transition="{ duration: 0.3 }"
        class="mt-3"
      >
        <UAlert
          :description="uploadingFile.error"
          color="error"
          variant="soft"
          icon="tabler:alert-circle"
          :ui="{
            root: 'px-2.5 py-2',
          }"
        />
      </motion.div>
    </AnimatePresence>

    <!-- 跳过/阻止提示 -->
    <AnimatePresence>
      <motion.div
        v-if="
          (uploadingFile.status === 'skipped' ||
            uploadingFile.status === 'blocked') &&
            uploadingFile.error
        "
        :initial="{ opacity: 0, height: 0, y: -10 }"
        :animate="{ opacity: 1, height: 'auto', y: 0 }"
        :exit="{ opacity: 0, height: 0, y: -10 }"
        :transition="{ duration: 0.3 }"
        class="mt-3"
      >
        <UAlert
          :description="uploadingFile.error"
          :color="uploadingFile.status === 'blocked' ? 'error' : 'warning'"
          variant="soft"
          :icon="
            uploadingFile.status === 'blocked'
              ? 'tabler:ban'
              : 'tabler:player-track-next'
          "
          :ui="{
            root: 'px-2.5 py-2',
          }"
        />
      </motion.div>
    </AnimatePresence>

    <!-- 警告信息（如重复文件警告并覆盖） -->
    <AnimatePresence>
      <motion.div
        v-if="uploadingFile.warning"
        :initial="{ opacity: 0, height: 0, y: -10 }"
        :animate="{ opacity: 1, height: 'auto', y: 0 }"
        :exit="{ opacity: 0, height: 0, y: -10 }"
        :transition="{ duration: 0.3 }"
        class="mt-3"
      >
        <UAlert
          :description="uploadingFile.warning"
          color="warning"
          variant="soft"
          icon="tabler:alert-triangle"
          :ui="{
            root: 'px-2.5 py-2',
          }"
        />
      </motion.div>
    </AnimatePresence>

    <!-- 处理时间警告 -->
    <AnimatePresence>
      <motion.div
        v-if="showProcessingWarning && uploadingFile.status === 'processing'"
        :initial="{ opacity: 0, height: 0, y: -10 }"
        :animate="{ opacity: 1, height: 'auto', y: 0 }"
        :exit="{ opacity: 0, height: 0, y: -10 }"
        :transition="{ duration: 0.3 }"
        class="mt-3"
      >
        <UAlert
          description="大文件处理时间较长，为正常现象"
          color="info"
          variant="soft"
          icon="tabler:info-circle"
          :ui="{
            root: 'px-2.5 py-2',
          }"
        />
      </motion.div>
    </AnimatePresence>

    <!-- 成功动画 -->
    <AnimatePresence>
      <motion.div
        v-if="uploadingFile.status === 'completed'"
        :initial="{ opacity: 0, scale: 0.8, y: 10 }"
        :animate="{
          opacity: 1,
          scale: [0.8, 1.1, 1],
          y: 0,
        }"
        :exit="{ opacity: 0, scale: 0.9, y: -10 }"
        :transition="{
          duration: 0.6,
          ease: 'backOut',
        }"
        class="mt-3"
      >
        <UAlert
          description="文件已成功上传并处理"
          color="success"
          variant="soft"
          icon="tabler:circle-check"
          :ui="{
            root: 'px-2.5 py-2',
          }"
        />
      </motion.div>
    </AnimatePresence>
  </motion.div>
</template>

<style scoped>
/* 粒子爆开动画 */
.particle-burst {
  background: linear-gradient(45deg, #10b981, #059669, #047857);
  transform: translate(-50%, -50%);
  animation:
    particle-explode var(--duration, 1.5s) ease-out var(--delay, 0s) forwards,
    particle-fade var(--duration, 1.5s) ease-out var(--delay, 0s) forwards;
}

@keyframes particle-explode {
  0% {
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
    opacity: 1;
  }
  20% {
    transform: translate(
        calc(
          -50% + cos(var(--angle, 0deg)) * calc(var(--distance, 60px) * 0.3)
        ),
        calc(-50% + sin(var(--angle, 0deg)) * calc(var(--distance, 60px) * 0.3))
      )
      scale(1.2) rotate(calc(var(--angle, 0deg) * 2));
    opacity: 1;
  }
  100% {
    transform: translate(
        calc(-50% + cos(var(--angle, 0deg)) * var(--distance, 60px)),
        calc(-50% + sin(var(--angle, 0deg)) * var(--distance, 60px))
      )
      scale(0.3) rotate(calc(var(--angle, 0deg) * 4));
    opacity: 0;
  }
}

@keyframes particle-fade {
  0% {
    opacity: 1;
  }
  70% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
  }
}

/* 为不同的粒子添加颜色变化 */
.particle-burst:nth-child(3n + 1) {
  background: linear-gradient(45deg, #10b981, #34d399);
}

.particle-burst:nth-child(3n + 2) {
  background: linear-gradient(45deg, #059669, #10b981);
}

.particle-burst:nth-child(3n + 3) {
  background: linear-gradient(45deg, #047857, #059669);
}

/* 添加一些粒子的闪烁效果 */
.particle-burst:nth-child(4n + 1) {
  animation:
    particle-explode var(--duration, 1.5s) ease-out var(--delay, 0s) forwards,
    particle-fade var(--duration, 1.5s) ease-out var(--delay, 0s) forwards,
    particle-sparkle calc(var(--duration, 1.5s) * 0.5) ease-in-out
      var(--delay, 0s) forwards;
}

@keyframes particle-sparkle {
  0%,
  100% {
    box-shadow: 0 0 0 rgba(16, 185, 129, 0);
  }
  50% {
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
  }
}
</style>
