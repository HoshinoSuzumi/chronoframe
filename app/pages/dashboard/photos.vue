<script lang="ts" setup>
import type { TableColumn } from '@nuxt/ui'
import type { Photo, PipelineQueueItem } from '~~/server/utils/db'
import { h, resolveComponent } from 'vue'
import { Icon, UBadge } from '#components'
import ThumbImage from '~/components/ui/ThumbImage.vue'

const UCheckbox = resolveComponent('UCheckbox')

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: $t('title.photos'),
})

const MAX_FILE_SIZE = 256 // in MB

const dayjs = useDayjs()

const { status, refresh } = usePhotos()
const { filteredPhotos, selectedCounts, hasActiveFilters } = usePhotoFilters()

const totalSelectedFilters = computed(() => {
  return Object.values(selectedCounts.value).reduce(
    (total, count) => total + count,
    0,
  )
})

// 表态数据
const reactionsData = ref<Record<string, Record<string, number>>>({})
const reactionsLoading = ref(false)

// 获取表态数据
const fetchReactions = async (photoIds: string[]) => {
  if (photoIds.length === 0) return

  reactionsLoading.value = true
  try {
    const data = await $fetch('/api/photos/reactions', {
      query: { ids: photoIds },
    })
    reactionsData.value = data as Record<string, Record<string, number>>
  } catch (error) {
    console.error('获取表态数据失败:', error)
  } finally {
    reactionsLoading.value = false
  }
}

interface UploadingFile {
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
  stage?: PipelineQueueItem['statusStage'] | null
  progress?: number
  error?: string
  taskId?: number
  signedUrlResponse?: { signedUrl: string; fileKey: string; expiresIn: number }
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

const uploadingFiles = ref<Map<string, UploadingFile>>(new Map())

const uploadImage = async (file: File, existingFileId?: string) => {
  const fileName = file.name
  const fileId = existingFileId || `${Date.now()}-${fileName}`

  const uploadManager = useUpload({
    timeout: 10 * 60 * 1000, // 10分钟超时
  })

  // 获取或创建 uploadingFile
  let uploadingFile = uploadingFiles.value.get(fileId)
  if (!uploadingFile) {
    uploadingFile = {
      file,
      fileName,
      fileId,
      status: 'preparing',
      canAbort: false,
      abortUpload: () => uploadManager.abortUpload(),
    }
    uploadingFiles.value.set(fileId, uploadingFile)
  } else {
    // 更新现有条目的状态和回调
    uploadingFile.status = 'preparing'
    uploadingFile.canAbort = false
    uploadingFile.abortUpload = () => uploadManager.abortUpload()
    uploadingFiles.value = new Map(uploadingFiles.value)
  }

  try {
    // 第一步：获取预签名 URL
    uploadingFile.status = 'preparing'
    const signedUrlResponse = await $fetch('/api/photos', {
      method: 'POST',
      body: {
        fileName: file.name,
        contentType: file.type,
      },
    })

    uploadingFile.signedUrlResponse = signedUrlResponse

    // 检查是否为跳过模式（重复文件）
    if (signedUrlResponse.skipped) {
      uploadingFile.status = 'skipped'
      uploadingFile.progress = 100
      uploadingFile.canAbort = false
      uploadingFiles.value = new Map(uploadingFiles.value)
      return
    }

    uploadingFile.status = 'uploading'
    uploadingFile.canAbort = true
    uploadingFile.progress = 0
    uploadingFiles.value = new Map(uploadingFiles.value)

    // 第二步：使用 composable 上传文件到存储
    await uploadManager.uploadFile(file, signedUrlResponse.signedUrl, {
      onProgress: (progress: UploadProgress) => {
        uploadingFile.progress = progress.percentage
        uploadingFile.uploadProgress = {
          loaded: progress.loaded,
          total: progress.total,
          percentage: progress.percentage,
          speed: progress.speed,
          timeRemaining: progress.timeRemaining,
          speedText: progress.speed ? `${formatBytes(progress.speed)}/s` : '',
          timeRemainingText: progress.timeRemaining
            ? dayjs.duration(progress.timeRemaining, 'seconds').humanize()
            : '',
        }
        uploadingFiles.value = new Map(uploadingFiles.value)
      },
      onStatusChange: (status: string) => {
        uploadingFile.canAbort = status === 'uploading'
        uploadingFiles.value = new Map(uploadingFiles.value)
      },
      onSuccess: async (_xhr: XMLHttpRequest) => {
        // 第三步：上传完成，提交到队列任务
        uploadingFile.status = 'processing'
        uploadingFile.progress = 100
        uploadingFile.canAbort = false
        uploadingFile.stage = null // 重置 stage，准备显示任务状态
        uploadingFiles.value = new Map(uploadingFiles.value)

        try {
          // 检查是否为MOV视频文件（通过MIME类型或文件扩展名）
          const isMovFile =
            file.type === 'video/quicktime' ||
            file.type === 'video/mp4' ||
            file.name.toLowerCase().endsWith('.mov')

          const resp = await $fetch('/api/queue/add-task', {
            method: 'POST',
            body: {
              payload: {
                type: isMovFile ? 'live-photo-video' : 'photo',
                storageKey: signedUrlResponse.fileKey,
              },
              priority: isMovFile ? 0 : 1, // Live Photo 视频优先级更低，确保图片优先处理
              maxAttempts: 3,
            },
          })

          if (resp.success) {
            uploadingFile.taskId = resp.taskId
            uploadingFile.status = 'processing'
            uploadingFiles.value = new Map(uploadingFiles.value)

            // 开始任务状态检查
            startTaskStatusCheck(resp.taskId, fileId)
          } else {
            uploadingFile.status = 'error'
            uploadingFile.error = $t('dashboard.photos.messages.taskSubmitFailed')
            uploadingFiles.value = new Map(uploadingFiles.value)
          }
        } catch (processError: any) {
          uploadingFile.status = 'error'
          uploadingFile.error = `${$t('dashboard.photos.messages.taskSubmitFailed')}: ${processError.message}`
          uploadingFile.canAbort = false
          uploadingFiles.value = new Map(uploadingFiles.value)
        }
      },
      onError: (error: string) => {
        uploadingFile.status = 'error'
        uploadingFile.error = error
        uploadingFile.canAbort = false
        uploadingFiles.value = new Map(uploadingFiles.value)
      },
    })
  } catch (error: any) {
    uploadingFile.status = 'error'
    uploadingFile.canAbort = false

    // 处理重复文件阻止模式的错误
    if (error.statusCode === 409 && error.data?.duplicate) {
      uploadingFile.status = 'blocked'
      uploadingFile.error = error.data.title || $t('upload.duplicate.block.title')
    } else {
      // 其他错误
      uploadingFile.error = error.message || $t('dashboard.photos.messages.uploadFailed')
    }

    uploadingFiles.value = new Map(uploadingFiles.value)

    // 提供更详细的错误信息
    if (error.response?.status === 401) {
      uploadingFile.error = $t('dashboard.photos.errors.uploadUnauthorized')
    } else if (error.message?.includes('CORS')) {
      uploadingFile.error = $t('dashboard.photos.errors.uploadCorsError')
    } else if (
      error.message?.includes('NetworkError') ||
      error.name === 'TypeError'
    ) {
      uploadingFile.error = $t('dashboard.photos.errors.uploadNetworkError')
    } else if (error.message?.includes('上传到存储失败')) {
      uploadingFile.error = $t('dashboard.photos.messages.uploadFailed')
    }

    uploadingFiles.value = new Map(uploadingFiles.value)
  }
}

const toast = useToast()
const selectedFiles = ref<File[]>([])
const isUploadSlideoverOpen = ref(false)

const hasSelectedFiles = computed(() => selectedFiles.value.length > 0)

const selectedFilesTotalSize = computed(() =>
  selectedFiles.value.reduce((total, file) => total + (file?.size || 0), 0),
)

const selectedFilesTotalSizeLabel = computed(() =>
  selectedFilesTotalSize.value > 0
    ? formatBytes(selectedFilesTotalSize.value)
    : '0 B',
)

const selectedFilesSummary = computed(() => {
  if (!selectedFiles.value.length) {
    return $t('dashboard.photos.slideover.footer.noSelection')
  }

  return $t('dashboard.photos.slideover.footer.prepared', {
    count: selectedFiles.value.length,
    size: selectedFilesTotalSizeLabel.value,
  })
})

const clearSelectedFiles = () => {
  selectedFiles.value = []
}

watch(isUploadSlideoverOpen, (open) => {
  if (!open) {
    clearSelectedFiles()
  }
})

const openUploadSlideover = () => {
  isUploadSlideoverOpen.value = true
}

// 表格多选状态
const rowSelection = ref({})
const table: any = useTemplateRef('table')

const selectedRowsCount = computed((): number => {
  return table.value?.tableApi?.getFilteredSelectedRowModel().rows.length || 0
})

const totalRowsCount = computed((): number => {
  return table.value?.tableApi?.getFilteredRowModel().rows.length || 0
})

const livePhotoStats = computed(() => {
  if (!filteredPhotos.value) return { total: 0, livePhotos: 0, staticPhotos: 0 }

  const total = filteredPhotos.value.length
  const livePhotos = filteredPhotos.value.filter(
    (photo: Photo) => photo.isLivePhoto,
  ).length
  const staticPhotos = total - livePhotos

  return { total, livePhotos, staticPhotos }
})

const photoFilter = ref<'all' | 'livephoto' | 'static'>('all')

const filteredData = computed(() => {
  if (!filteredPhotos.value) return []

  switch (photoFilter.value) {
    case 'livephoto':
      return filteredPhotos.value.filter((photo: Photo) => photo.isLivePhoto)
    case 'static':
      return filteredPhotos.value.filter((photo: Photo) => !photo.isLivePhoto)
    default:
      return filteredPhotos.value
  }
})

// 监听过滤后的照片变化，自动获取表态数据
watch(
  () => filteredData.value,
  async (photos) => {
    if (photos && photos.length > 0) {
      const photoIds = photos.map((p: Photo) => p.id)
      await fetchReactions(photoIds)
    }
  },
  { immediate: true },
)

// 状态检查间隔 Map，每个任务对应一个定时器
const statusIntervals = ref<Map<number, NodeJS.Timeout>>(new Map())

// 启动任务状态检查
const startTaskStatusCheck = (taskId: number, fileId: string) => {
  const intervalId = setInterval(async () => {
    try {
      const response = await $fetch(`/api/queue/stats/${taskId}`)
      const uploadingFile = uploadingFiles.value.get(fileId)

      if (!uploadingFile) {
        clearInterval(intervalId)
        statusIntervals.value.delete(taskId)
        return
      }

      // 更新任务状态
      uploadingFile.stage =
        response.status === 'in-stages' ? response.statusStage : null
      uploadingFiles.value = new Map(uploadingFiles.value)

      if (response.status === 'completed') {
        // 任务完成
        uploadingFile.status = 'completed'
        uploadingFile.stage = null
        uploadingFiles.value = new Map(uploadingFiles.value)

        // 停止状态检查
        clearInterval(intervalId)
        statusIntervals.value.delete(taskId)

        // 不再显示单独的成功提示，由上传组件统一处理

        // 刷新照片列表
        await refresh()

        // 2秒后从界面移除成功的任务
        // setTimeout(() => {
        //   uploadingFiles.value.delete(fileId)
        //   uploadingFiles.value = new Map(uploadingFiles.value)
        // }, 2000)
      } else if (response.status === 'failed') {
        // 任务失败
        uploadingFile.status = 'error'
        uploadingFile.error = `${$t('dashboard.photos.messages.error')}: ${response.errorMessage || $t('dashboard.photos.table.cells.unknown')}`
        uploadingFile.stage = null
        uploadingFiles.value = new Map(uploadingFiles.value)

        // 停止状态检查
        clearInterval(intervalId)
        statusIntervals.value.delete(taskId)

        // 错误信息已在上传组件中显示，不需要额外通知
        // 失败的任务不自动移除，让用户查看错误信息
      }
    } catch (error) {
      console.error('检查任务状态失败:', error)

      // 如果检查状态失败，清理定时器
      clearInterval(intervalId)
      statusIntervals.value.delete(taskId)

      const uploadingFile = uploadingFiles.value.get(fileId)
      if (uploadingFile) {
        uploadingFile.status = 'error'
        uploadingFile.error = $t('dashboard.photos.messages.taskStatusCheckFailed')
        uploadingFiles.value = new Map(uploadingFiles.value)
      }
    }
  }, 1000) // 每秒检查一次

  statusIntervals.value.set(taskId, intervalId)
}

// 手动移除上传任务
const removeUploadingFile = (fileId: string) => {
  const uploadingFile = uploadingFiles.value.get(fileId)

  // 如果任务还在进行中，先清理定时器
  if (uploadingFile?.taskId) {
    const intervalId = statusIntervals.value.get(uploadingFile.taskId)
    if (intervalId) {
      clearInterval(intervalId)
      statusIntervals.value.delete(uploadingFile.taskId)
    }
  }

  // 从列表中移除
  uploadingFiles.value.delete(fileId)
  uploadingFiles.value = new Map(uploadingFiles.value)
}

// 批量清除已完成和错误的任务
const clearCompletedTasks = () => {
  const toRemove: string[] = []

  for (const [fileId, uploadingFile] of uploadingFiles.value) {
    if (
      uploadingFile.status === 'completed' ||
      uploadingFile.status === 'error'
    ) {
      toRemove.push(fileId)

      // 清理可能存在的定时器
      if (uploadingFile.taskId) {
        const intervalId = statusIntervals.value.get(uploadingFile.taskId)
        if (intervalId) {
          clearInterval(intervalId)
          statusIntervals.value.delete(uploadingFile.taskId)
        }
      }
    }
  }

  toRemove.forEach((fileId) => {
    uploadingFiles.value.delete(fileId)
  })

  uploadingFiles.value = new Map(uploadingFiles.value)

  if (toRemove.length > 0) {
    toast.add({
      title: $t('dashboard.photos.uploadQueue.taskCleared'),
      description: $t('dashboard.photos.uploadQueue.tasksCleared', { count: toRemove.length }),
      color: 'info',
    })
  }
}

// 清除已完成的上传
const clearCompletedUploads = () => {
  clearCompletedTasks()
}

// 清除所有上传
const clearAllUploads = () => {
  const toRemove: string[] = []

  for (const [fileId, uploadingFile] of uploadingFiles.value) {
    toRemove.push(fileId)

    // 如果是正在上传的任务，先中止
    if (uploadingFile.status === 'uploading' && uploadingFile.abortUpload) {
      uploadingFile.abortUpload()
    }

    // 清理状态检查定时器
    if (uploadingFile.taskId) {
      const intervalId = statusIntervals.value.get(uploadingFile.taskId)
      if (intervalId) {
        clearInterval(intervalId)
        statusIntervals.value.delete(uploadingFile.taskId)
      }
    }
  }

  uploadingFiles.value.clear()
  uploadingFiles.value = new Map(uploadingFiles.value)

  if (toRemove.length > 0) {
    toast.add({
      title: $t('dashboard.photos.uploadQueue.allTasksCleared'),
      description: $t('dashboard.photos.uploadQueue.tasksCleared', { count: toRemove.length }),
      color: 'info',
    })
  }
}

const columns: TableColumn<Photo>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'aria-label': 'Select all',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        modelValue: row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          row.toggleSelected(!!value),
        'aria-label': 'Select row',
      }),
  },
  {
    accessorKey: 'thumbnailUrl',
    header: $t('dashboard.photos.table.columns.thumbnail'),
    cell: ({ row }) => {
      const url = row.original.thumbnailUrl
      return h(ThumbImage, {
        src: url || row.original.originalUrl || '',
        alt: row.original.title || 'Photo Thumbnail',
        key: row.original.id,
        thumbhash: row.original.thumbnailHash || '',
        class: 'size-16 min-w-[100px] object-cover rounded-md shadow',
        onClick: () => openInNewTab(url || row.original.originalUrl || ''),
        style: { cursor: url ? 'pointer' : 'default' },
      })
    },
  },
  {
    accessorKey: 'id',
    header: $t('dashboard.photos.table.columns.id'),
  },
  {
    accessorKey: 'title',
    header: $t('dashboard.photos.table.columns.title'),
  },
  {
    accessorKey: 'tags',
    header: $t('dashboard.photos.table.columns.tags'),
    cell: ({ row }) => {
      const tags = row.original.tags
      return h('div', { class: 'flex items-center gap-1' }, [
        tags && tags.length
          ? tags.map((tag) =>
              h(
                UBadge,
                {
                  size: 'sm',
                  variant: 'soft',
                  color: 'neutral',
                },
                () => tag,
              ),
            )
          : h('span', { class: 'text-neutral-400 text-xs' }, $t('dashboard.photos.table.cells.noTags')),
      ])
    },
  },
  {
    accessorKey: 'isLivePhoto',
    header: $t('dashboard.photos.table.columns.isLivePhoto'),
    cell: ({ row }) => {
      const isLivePhoto = row.original.isLivePhoto
      return h('div', { class: 'flex items-center gap-2' }, [
        isLivePhoto
          ? h('div', { class: 'flex items-center gap-1' }, [
              h(Icon, {
                name: 'tabler:live-photo',
                class: 'size-4 text-yellow-600 dark:text-yellow-400',
              }),
              h(
                'span',
                {
                  class:
                    'text-yellow-600 dark:text-yellow-400 text-xs font-medium',
                },
                $t('ui.livePhoto'),
              ),
            ])
          : h(
              'span',
              {
                class: 'text-neutral-400 text-xs',
              },
              $t('dashboard.photos.table.cells.staticPhoto'),
            ),
      ])
    },
    sortingFn: (rowA, rowB) => {
      const valueA = rowA.original.isLivePhoto ? 1 : 0
      const valueB = rowB.original.isLivePhoto ? 1 : 0
      return valueB - valueA // LivePhoto 优先排序
    },
  },
  {
    accessorKey: 'location',
    header: $t('dashboard.photos.table.columns.location'),
    cell: ({ row }) => {
      const { exif, city, country } = row.original

      if (!exif?.GPSLongitude && !exif?.GPSLatitude) {
        return h('span', { class: 'text-neutral-400 text-xs' }, $t('dashboard.photos.table.cells.noGps'))
      }

      const location = [city, country].filter(Boolean).join(', ')
      return h(
        'span',
        {
          class: location ? 'text-xs' : 'text-neutral-400 text-xs',
        },
        location || $t('dashboard.photos.table.cells.unknown'),
      )
    },
  },
  {
    accessorKey: 'dateTaken',
    header: $t('dashboard.photos.table.columns.dateTaken'),
    cell: (info) => {
      const date = info.getValue() as string
      return h(
        'span',
        { class: 'font-mono text-xs' },
        date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : $t('dashboard.photos.table.cells.unknown'),
      )
    },
  },
  {
    accessorKey: 'lastModified',
    header: $t('dashboard.photos.table.columns.lastModified'),
    cell: (info) => {
      const date = info.getValue() as string
      return h(
        'span',
        { class: 'font-mono text-xs' },
        date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : $t('dashboard.photos.table.cells.unknown'),
      )
    },
  },
  {
    accessorKey: 'fileSize',
    header: $t('dashboard.photos.table.columns.fileSize'),
    cell: (info) => formatBytes(info.getValue() as number),
  },
  {
    accessorFn: (row) => row.exif?.ColorSpace,
    header: $t('dashboard.photos.table.columns.colorSpace'),
  },
  {
    accessorKey: 'reactions',
    header: $t('dashboard.photos.table.columns.reactions'),
    cell: ({ row }) => {
      const photoId = row.original.id
      const reactions = reactionsData.value[photoId] || {}
      const totalReactions = Object.values(reactions).reduce(
        (sum: number, count) => sum + (count as number),
        0,
      )

      if (totalReactions === 0) {
        return h('span', { class: 'text-neutral-400 text-xs' }, $t('dashboard.photos.table.cells.noReactions'))
      }

      const reactionIcons: Record<string, string> = {
        like: 'fluent-emoji-flat:thumbs-up',
        love: 'fluent-emoji-flat:red-heart',
        amazing: 'fluent-emoji-flat:smiling-face-with-heart-eyes',
        funny: 'fluent-emoji-flat:face-with-tears-of-joy',
        wow: 'fluent-emoji-flat:face-with-open-mouth',
        sad: 'fluent-emoji-flat:crying-face',
        fire: 'fluent-emoji-flat:fire',
        sparkle: 'fluent-emoji-flat:sparkles',
      }

      // 显示前3个有数据的表态
      const topReactions = Object.entries(reactions)
        .filter(([_, count]) => (count as number) > 0)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)

      return h(
        'div',
        { class: 'flex items-center gap-2' },
        [
          ...topReactions.map(([type, count]) =>
            h('div', { class: 'flex items-center gap-0.5' }, [
              h(Icon, {
                name:
                  reactionIcons[type] ||
                  'fluent-emoji-flat:face-with-tears-of-joy',
                class: 'size-4',
                mode: 'svg',
              }),
              h(
                'span',
                {
                  class:
                    'text-xs font-medium text-neutral-700 dark:text-neutral-300',
                },
                count,
              ),
            ]),
          ),
          totalReactions > topReactions.length
            ? h(
                'span',
                { class: 'text-xs text-neutral-400' },
                `+${totalReactions - topReactions.reduce((sum, [_, count]) => sum + (count as number), 0)}`,
              )
            : null,
        ].filter(Boolean),
      )
    },
  },
  {
    accessorKey: 'actions',
    header: $t('dashboard.photos.table.columns.actions'),
  },
]

// 文件验证函数
const validateFile = (file: File): { valid: boolean; error?: string } => {
  // 检查文件类型
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'video/quicktime', // MOV 文件
  ]

  const isValidImageType = allowedTypes.includes(file.type)
  const isValidImageExtension = ['.heic', '.heif'].some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  )
  const isValidVideoExtension = file.name.toLowerCase().endsWith('.mov')

  if (!isValidImageType && !isValidImageExtension && !isValidVideoExtension) {
    return {
      valid: false,
      error: $t('dashboard.photos.errors.unsupportedFormat', { type: file.type }),
    }
  }

  const maxSize = MAX_FILE_SIZE * 1024 * 1024
  if (file.size > maxSize) {
    return {
      valid: false,
      error: $t('dashboard.photos.errors.fileTooLarge', {
        size: (file.size / 1024 / 1024).toFixed(2),
        maxSize: MAX_FILE_SIZE,
      }),
    }
  }

  return { valid: true }
}

const handleUpload = async () => {
  const fileList = selectedFiles.value

  if (fileList.length === 0) {
    return
  }

  const errors: string[] = []

  // 先验证所有文件
  const validFiles: File[] = []
  const fileIdMapping = new Map<File, string>()

  for (const file of fileList) {
    const validation = validateFile(file)
    if (!validation.valid) {
      errors.push(`${file.name}: ${validation.error}`)
    } else {
      validFiles.push(file)
      // 为每个有效文件生成唯一ID
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`
      fileIdMapping.set(file, fileId)
    }
  }

  if (validFiles.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.error'),
      description: $t('dashboard.photos.errors.allFilesValidationFailed'),
      color: 'error',
    })
    selectedFiles.value = []
    return
  }

  // 立即为所有有效文件创建队列条目，状态为 waiting
  for (const file of validFiles) {
    const fileId = fileIdMapping.get(file)!
    const uploadingFile: UploadingFile = {
      file,
      fileName: file.name,
      fileId,
      status: 'waiting',
      canAbort: false,
    }
    uploadingFiles.value.set(fileId, uploadingFile)
  }

  // 触发队列更新
  uploadingFiles.value = new Map(uploadingFiles.value)

  // 动态并发上传，始终保持 CONCURRENT_LIMIT 个文件在上传
  const CONCURRENT_LIMIT = 3 // 限制同时上传的文件数量

  // 创建文件队列
  const fileQueue = [...validFiles]
  const activeUploads = new Set<Promise<void>>()

  // 启动上传任务的函数
  const startUpload = async (file: File): Promise<void> => {
    const fileId = fileIdMapping.get(file)!
    try {
      await uploadImage(file, fileId)
    } catch (error: any) {
      errors.push(`${file.name}: ${error.message || '上传失败'}`)
      console.error('上传错误:', error)
    }
  }

  // 处理队列的函数
  const processQueue = async (): Promise<void> => {
    while (fileQueue.length > 0 || activeUploads.size > 0) {
      // 如果当前活跃上传数量小于限制，且队列中还有文件，则启动新的上传
      while (activeUploads.size < CONCURRENT_LIMIT && fileQueue.length > 0) {
        const file = fileQueue.shift()!
        const uploadPromise = startUpload(file)

        activeUploads.add(uploadPromise)

        // 当上传完成时，从活跃集合中移除
        uploadPromise.finally(() => {
          activeUploads.delete(uploadPromise)
        })
      }

      // 如果有活跃的上传，等待至少一个完成
      if (activeUploads.size > 0) {
        await Promise.race(activeUploads)
      }
    }
  }

  // 开始处理队列
  await processQueue()

  if (errors.length > 0) {
    console.error('批量上传错误详情:', errors)
  }

  // 清空选中的文件
  selectedFiles.value = []
  isUploadSlideoverOpen.value = false
}

// LivePhoto 相关操作
const handleViewLivePhoto = async (photoId: string) => {
  try {
    const livePhotoInfo = await $fetch(`/api/photos/${photoId}/livephoto`)

    if (livePhotoInfo.isLivePhoto && livePhotoInfo.livePhotoVideoUrl) {
      // 设置模态框数据
      selectedLivePhoto.value = {
        id: livePhotoInfo.id,
        title: livePhotoInfo.title,
        originalUrl: livePhotoInfo.originalUrl || '',
        videoUrl: livePhotoInfo.livePhotoVideoUrl,
      }
      isLivePhotoModalOpen.value = true
    } else {
      toast.add({
        title: $t('dashboard.photos.messages.livePhotoNotFound'),
        description: '',
        color: 'warning',
      })
    }
  } catch (error) {
    console.error('获取 LivePhoto 信息失败:', error)
    toast.add({
      title: $t('dashboard.photos.messages.error'),
      description: $t('dashboard.photos.messages.livePhotoLoadError'),
      color: 'error',
    })
  }
}

// 重新处理单张照片
const handleReprocessSingle = async (photo: Photo) => {
  try {
    if (!photo || !photo.storageKey) {
      toast.add({
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.messages.noStorageKey'),
        color: 'error',
      })
      return
    }

    const reprocessToast = toast.add({
      title: $t('dashboard.photos.messages.reprocessSuccess'),
      description: '',
      color: 'info',
    })

    const result = await $fetch('/api/queue/add-task', {
      method: 'POST',
      body: {
        payload: {
          type: 'photo',
          storageKey: photo.storageKey,
        },
        priority: 0,
        maxAttempts: 3,
      },
    })

    if (result.success) {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.reprocessSuccess'),
        description: $t('dashboard.photos.messages.reprocessTaskId', { taskId: result.taskId }),
        color: 'success',
      })
    } else {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.messages.taskSubmitFailed'),
        color: 'error',
      })
    }
  } catch (error: any) {
    console.error('处理照片失败:', error)
    toast.add({
      title: $t('dashboard.photos.messages.reprocessFailed'),
      description: error.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  }
}

// LivePhoto Modal
const isLivePhotoModalOpen = ref(false)
const selectedLivePhoto = ref<{
  id: string
  title: string | null
  originalUrl: string
  videoUrl: string
} | null>(null)

const openInNewTab = (url: string) => {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank')
  }
}

const isDeleteConfirmOpen = ref(false)
const deleteMode = ref<'single' | 'batch'>('single')
const deleteTargetPhotos = ref<Photo[]>([])
const isDeleting = ref(false)

const openDeleteConfirm = (mode: 'single' | 'batch', photos: Photo[]) => {
  deleteMode.value = mode
  deleteTargetPhotos.value = photos
  isDeleteConfirmOpen.value = true
}

const handleSingleDeleteRequest = (photo: Photo) => {
  openDeleteConfirm('single', [photo])
}

// 批量删除功能
  const handleBatchDelete = () => {
    const selectedRowModel = table.value?.tableApi?.getFilteredSelectedRowModel()
    const selectedPhotos =
      selectedRowModel?.rows.map((row: any) => row.original) || []

    if (selectedPhotos.length === 0) {
      toast.add({
        title: $t('dashboard.photos.selection.selected', { count: 0, total: 0 }),
        description: $t('dashboard.photos.messages.batchSelectRequired'),
        color: 'warning',
      })
      return
    }

    openDeleteConfirm('batch', selectedPhotos)
  }

const confirmDelete = async () => {
  if (deleteTargetPhotos.value.length === 0) {
    isDeleteConfirmOpen.value = false
    return
  }

  const mode = deleteMode.value
  const targetPhotos = [...deleteTargetPhotos.value]

  let deleteToast: ReturnType<typeof toast.add> | null = null

  isDeleting.value = true

  try {
    if (mode === 'batch') {
      deleteToast = toast.add({
        title: $t('dashboard.photos.delete.batch.title'),
        description: $t('dashboard.photos.messages.deleteSuccess'),
        color: 'info',
      })
      await Promise.all(
        targetPhotos.map((photo) =>
          $fetch(`/api/photos/${photo.id}`, {
            method: 'DELETE',
          }),
        ),
      )

      toast.update(deleteToast.id, {
        title: $t('dashboard.photos.messages.batchDeleteSuccess', { count: targetPhotos.length }),
        description: '',
        color: 'success',
      })

      rowSelection.value = {}
    } else {
      const photo = targetPhotos[0]
      if (!photo) {
        throw new Error($t('dashboard.photos.messages.error'))
      }

      await $fetch(`/api/photos/${photo.id}`, {
        method: 'DELETE',
      })

      toast.add({
        title: $t('dashboard.photos.messages.deleteSuccess'),
        description: '',
        color: 'success',
      })
    }

    await refresh()
    isDeleteConfirmOpen.value = false
    deleteTargetPhotos.value = []
  } catch (error: any) {
    console.error('删除照片失败:', error)
    const message = error?.message || $t('dashboard.photos.messages.error')

    if (mode === 'batch' && deleteToast) {
      toast.update(deleteToast.id, {
        title: $t('dashboard.photos.messages.batchDeleteFailed'),
        description: message,
        color: 'error',
      })
    } else {
      toast.add({
        title: $t('dashboard.photos.messages.deleteFailed'),
        description: message,
        color: 'error',
      })
    }
  }

  isDeleting.value = false
}

// 批量重新处理照片功能
const handleBatchReprocess = async () => {
  const selectedRowModel = table.value?.tableApi?.getFilteredSelectedRowModel()
  const selectedPhotos =
    selectedRowModel?.rows.map((row: any) => row.original) || []

  if (selectedPhotos.length === 0) {
    toast.add({
      title: $t('dashboard.photos.messages.batchSelectRequired'),
      description: '',
      color: 'warning',
    })
    return
  }

  // 检查所有选中照片是否都有 storageKey
  const photosWithStorageKey = selectedPhotos.filter(
    (photo: Photo) => photo.storageKey,
  )
  if (photosWithStorageKey.length !== selectedPhotos.length) {
    toast.add({
      title: $t('dashboard.photos.messages.error'),
      description: $t('dashboard.photos.messages.batchNoStorageKey', { count: selectedPhotos.length - photosWithStorageKey.length }),
      color: 'error',
    })
    return
  }

  try {
    const reprocessToast = toast.add({
      title: $t('dashboard.photos.messages.batchSelectRequired'),
      description: '',
      color: 'info',
    })

    const result = await $fetch('/api/queue/add-tasks', {
      method: 'POST',
      body: {
        tasks: photosWithStorageKey.map((photo: Photo) => ({
          payload: {
            type: 'photo',
            storageKey: photo.storageKey,
          },
          priority: 0,
          maxAttempts: 3,
        })),
      },
    })

    if (result.success) {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.reprocessSuccess'),
        description: $t('dashboard.queue.title', { count: photosWithStorageKey.length }),
        color: 'success',
      })
    } else {
      toast.update(reprocessToast.id, {
        title: $t('dashboard.photos.messages.error'),
        description: $t('dashboard.photos.messages.batchReprocessFailed'),
        color: 'error',
      })
    }

    // 清空选中状态
    rowSelection.value = {}
  } catch (error: any) {
    console.error('批量处理失败:', error)
    toast.add({
      title: $t('dashboard.photos.messages.batchReprocessFailed'),
      description: error.message || $t('dashboard.photos.messages.error'),
      color: 'error',
    })
  }
}

// 清理定时器
onUnmounted(() => {
  // 清理所有状态检查定时器
  statusIntervals.value.forEach((intervalId) => {
    clearInterval(intervalId)
  })
  statusIntervals.value.clear()
})
</script>

<template>
  <div class="flex flex-col gap-3 sm:gap-4 h-full p-3 sm:p-4">
    <!-- 上传队列容器 - 使用新的浮动组件 -->
    <UploadQueuePanel
      :uploading-files="uploadingFiles"
      @remove-file="removeUploadingFile"
      @clear-completed="clearCompletedUploads"
      @clear-all="clearAllUploads"
      @go-to-queue="$router.push('/dashboard/queue')"
    />

    <!-- 文件上传入口 -->
    <div
      class="relative overflow-hidden rounded-3xl border border-neutral-200/80 bg-gradient-to-br from-white via-white to-neutral-50 shadow-sm transition dark:border-neutral-800/70 dark:from-neutral-900 dark:via-neutral-900/80 dark:to-neutral-900"
    >
      <div
        class="pointer-events-none absolute -left-32 top-[-6rem] h-[18rem] w-[18rem] rounded-full bg-primary-400/20 blur-3xl dark:bg-primary-500/20"
      />
      <div class="relative flex flex-col gap-6 p-5 sm:p-8">
        <div
          class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
        >
            <div class="space-y-4">
            <div class="flex items-center gap-3">
              <span
                class="flex size-12 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"
              >
                <Icon
                  name="tabler:cloud-upload"
                  class="size-6"
                />
              </span>
              <div>
                <h2
                  class="text-lg font-semibold text-neutral-800 dark:text-neutral-100"
                >
                  {{ $t('dashboard.photos.title') }}
                </h2>
                <i18n-t
                  keypath="dashboard.photos.subtitle"
                  tag="p"
                  class="mt-1 text-sm text-neutral-500 dark:text-neutral-400"
                >
                  <template #default>
                    <NuxtLink
                      to="/dashboard/albums"
                      class="text-primary font-medium"
                    >
                      {{ $t('title.albums') }}
                    </NuxtLink>
                  </template>
                </i18n-t>
              </div>
            </div>            <div
              class="flex flex-wrap items-center gap-1 text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              <UBadge
                variant="soft"
                color="primary"
                size="sm"
              >
                JPEG / PNG
              </UBadge>
              <UBadge
                variant="soft"
                color="primary"
                size="sm"
              >
                HEIC
              </UBadge>
              <UBadge
                variant="soft"
                color="primary"
                size="sm"
              >
                {{ $t('ui.livePhoto') }}
              </UBadge>
              <UBadge
                variant="soft"
                color="primary"
                size="sm"
              >
                Motion Photo
              </UBadge>
              <UBadge
                variant="outline"
                color="neutral"
                size="sm"
              >
                {{ $t('dashboard.photos.maxFileSize', { size: MAX_FILE_SIZE }) }}
              </UBadge>
            </div>
          </div>

          <div class="flex gap-2 items-center">
            <UButton
              variant="soft"
              size="lg"
              class="w-full sm:w-auto"
              icon="tabler:list-check"
              @click="$router.push('/dashboard/queue')"
            >
              {{ $t('dashboard.photos.buttons.queue') }}
            </UButton>
            <UButton
              size="lg"
              class="w-full sm:w-auto"
              icon="tabler:cloud-upload"
              @click="openUploadSlideover"
            >
              {{ $t('dashboard.photos.buttons.upload') }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <USlideover
      v-model:open="isUploadSlideoverOpen"
      :title="$t('dashboard.photos.slideover.title')"
      :description="$t('dashboard.photos.slideover.description')"
      :ui="{
        content: 'sm:max-w-xl',
        body: 'p-2',
        header: 'px-6 py-5 border-b border-neutral-200 dark:border-neutral-800',
        footer: 'px-6 py-5 border-t border-neutral-200 dark:border-neutral-800',
      }"
    >
      <template #body>
        <UFileUpload
          v-model="selectedFiles"
          :label="$t('dashboard.photos.uploader.label')"
          :description="$t('dashboard.photos.uploader.description', { maxSize: MAX_FILE_SIZE })"
          icon="tabler:cloud-upload"
          layout="list"
          size="xl"
          accept="image/jpeg,image/png,image/heic,image/heif,video/quicktime,.mov"
          multiple
          highlight
          dropzone
          :file-delete="{ variant: 'soft', color: 'neutral' }"
          :ui="{
            root: 'w-full',
            base: 'group relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-neutral-200/80 bg-white/90 px-6 py-12 text-center shadow-sm transition-all duration-300 hover:border-primary-400/80 hover:bg-primary-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 dark:border-neutral-700/70 dark:bg-neutral-900/80',
            wrapper: 'flex flex-col items-center gap-2',
            label:
              'text-base font-semibold text-neutral-800 dark:text-neutral-100',
            description: 'text-sm text-neutral-500 dark:text-neutral-400',
            files: 'mt-2 flex w-full flex-col gap-2 overflow-y-auto',
            file: 'flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white/80 px-4 py-3 text-left shadow-sm shadow-black/5 backdrop-blur-sm dark:border-neutral-800/80 dark:bg-neutral-900/70',
            fileLeadingAvatar: 'ring-1 ring-white/80 dark:ring-neutral-800',
            fileWrapper: 'min-w-0 flex-1',
            fileName:
              'text-sm font-medium text-neutral-700 dark:text-neutral-100 truncate',
            fileSize: 'text-xs text-neutral-500 dark:text-neutral-400',
            fileTrailingButton: 'text-neutral-400 hover:text-error-500',
          }"
        />
      </template>

      <template #footer>
        <div
          class="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div
            class="flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400"
          >
            <span>{{
              hasSelectedFiles
                ? selectedFilesSummary
                : $t('dashboard.photos.slideover.footer.noSelection')
            }}</span>
          </div>
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <UButton
              variant="soft"
              color="neutral"
              class="w-full sm:w-auto"
              :disabled="!hasSelectedFiles"
              @click="clearSelectedFiles"
            >
              {{ $t('dashboard.photos.slideover.buttons.clear') }}
            </UButton>
            <UButton
              color="primary"
              size="lg"
              class="w-full sm:w-auto"
              icon="tabler:upload"
              :disabled="!hasSelectedFiles"
              @click="handleUpload"
            >
              {{
                hasSelectedFiles
                  ? $t('dashboard.photos.slideover.buttons.upload', { count: selectedFiles.length })
                  : $t('dashboard.photos.buttons.upload')
              }}
            </UButton>
          </div>
        </div>
      </template>
    </USlideover>

    <!-- 工具栏 -->
    <div
      class="flex flex-row sm:items-center justify-between gap-3 sm:gap-0 p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg"
    >
      <div class="flex items-center gap-2">
        <UIcon
          name="tabler:photo"
          class="text-neutral-500"
        />
        <span
          class="font-medium text-neutral-700 dark:text-neutral-300 hidden sm:inline"
        >
          {{ $t('dashboard.photos.toolbar.title') }}
        </span>
        <div class="flex items-center gap-1 sm:gap-2">
          <UBadge
            v-if="livePhotoStats.staticPhotos > 0"
            variant="soft"
            color="neutral"
            size="sm"
          >
            <span class="hidden sm:inline"
              >{{ livePhotoStats.staticPhotos }} {{ $t('dashboard.photos.stats.photos') }}</span
            >
            <span class="sm:hidden">{{ livePhotoStats.staticPhotos }}P</span>
          </UBadge>
          <UBadge
            v-if="livePhotoStats.livePhotos > 0"
            variant="soft"
            color="warning"
            size="sm"
          >
            <span class="hidden sm:inline"
              >{{ livePhotoStats.livePhotos }} {{ $t('dashboard.photos.stats.livePhotos') }}</span
            >
            <span class="sm:hidden">{{ livePhotoStats.livePhotos }}LP</span>
          </UBadge>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UPopover>
          <UTooltip :text="$t('ui.action.filter.tooltip')">
            <UChip
              inset
              size="sm"
              color="info"
              :show="totalSelectedFilters > 0"
            >
              <UButton
                variant="soft"
                :color="hasActiveFilters ? 'info' : 'neutral'"
                class="bg-transparent rounded-full cursor-pointer relative"
                icon="tabler:filter"
                size="sm"
              />
            </UChip>
          </UTooltip>

          <template #content>
            <UCard variant="glassmorphism">
              <OverlayFilterPanel />
            </UCard>
          </template>
        </UPopover>
        <!-- 过滤器 -->
        <USelectMenu
          v-model="photoFilter"
          class="w-full sm:w-48"
          :items="[
            { label: $t('dashboard.photos.photoFilter.all'), value: 'all', icon: 'tabler:photo-scan' },
            {
              label: $t('dashboard.photos.photoFilter.livephoto'),
              value: 'livephoto',
              icon: 'tabler:live-photo',
            },
            { label: $t('dashboard.photos.photoFilter.static'), value: 'static', icon: 'tabler:photo' },
          ]"
          value-key="value"
          label-key="label"
          size="sm"
        >
        </USelectMenu>

        <!-- 刷新按钮 -->
        <UButton
          variant="soft"
          color="info"
          size="sm"
          icon="tabler:refresh"
          :loading="reactionsLoading"
          @click="
            async () => {
              await refresh()
              if (filteredData.length > 0) {
                await fetchReactions(filteredData.map((p: Photo) => p.id))
              }
            }
          "
        >
          <span class="hidden sm:inline">{{ $t('dashboard.photos.toolbar.refresh') }}</span>
        </UButton>
      </div>
    </div>

    <!-- 照片列表 -->
    <div
      class="border border-neutral-300 dark:border-neutral-800 rounded overflow-hidden"
    >
      <UTable
        ref="table"
        v-model:row-selection="rowSelection"
        :column-pinning="{
          right: ['actions'],
        }"
        :data="filteredData as Photo[]"
        :columns="columns"
        :loading="status === 'pending'"
        sticky
        class="h-[calc(100vh-25rem)] sm:h-[calc(100vh-24.5rem)]"
        :ui="{
          separator:
            'bg-(--ui-color-neutral-200) dark:bg-(--ui-color-neutral-700)',
        }"
      >
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu
              size="sm"
              :content="{
                align: 'end',
              }"
              :items="[
                [
                  {
                    label: $t('dashboard.photos.actions.reprocess'),
                    icon: 'tabler:refresh',
                    onSelect() {
                      handleReprocessSingle(row.original)
                    },
                  },
                  {
                    label: $t('dashboard.photos.actions.viewLivePhoto'),
                    icon: 'tabler:live-photo',
                    disabled: !row.original.isLivePhoto,
                    onSelect() {
                      handleViewLivePhoto(row.original.id)
                    },
                  },
                ],
                [
                  {
                    color: 'error',
                    label: $t('dashboard.photos.actions.delete'),
                    icon: 'tabler:trash',
                    onSelect: () => handleSingleDeleteRequest(row.original),
                  },
                ],
              ]"
            >
              <UButton
                variant="outline"
                color="neutral"
                size="sm"
                icon="tabler:dots-vertical"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>

      <!-- 选择状态信息和批量操作 -->
      <div
        class="px-4 py-4 border-t border-neutral-200 dark:border-neutral-700"
      >
        <div
          class="text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-2"
        >
          <div class="leading-6">
            {{ $t('dashboard.photos.selection.selected', { count: selectedRowsCount, total: totalRowsCount }) }}
          </div>
          <div
            v-if="selectedRowsCount > 0"
            class="flex items-center gap-1 sm:gap-2"
          >
            <UButton
              variant="soft"
              color="info"
              size="xs"
              icon="tabler:refresh"
              class="flex-1 sm:flex-none"
              @click="handleBatchReprocess"
            >
              <span>{{ $t('dashboard.photos.selection.batchReprocess') }}</span>
            </UButton>

            <UButton
              color="error"
              variant="soft"
              size="xs"
              icon="tabler:trash"
              class="flex-1 sm:flex-none"
              @click="handleBatchDelete"
            >
              <span>{{ $t('dashboard.photos.selection.batchDelete') }}</span>
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="isDeleteConfirmOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-start gap-3">
            <Icon
              name="tabler:trash"
              class="mt-1 size-6 shrink-0 text-error-500"
            />
            <div class="space-y-2">
              <h3 class="text-lg font-semibold">
                {{ deleteMode === 'single' ? $t('dashboard.photos.delete.single.title') : $t('dashboard.photos.delete.batch.title') }}
              </h3>
              <p class="text-sm text-neutral-600 dark:text-neutral-400">
                {{
                  deleteMode === 'single'
                    ? $t('dashboard.photos.delete.single.message')
                    : $t('dashboard.photos.delete.batch.message', { count: deleteTargetPhotos.length })
                }}
              </p>
              <p class="text-sm text-error-500 dark:text-error-400">
                {{ $t('dashboard.photos.delete.warning') }}
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="isDeleting"
              @click="isDeleteConfirmOpen = false"
            >
              {{ $t('dashboard.photos.delete.buttons.cancel') }}
            </UButton>
            <UButton
              color="error"
              icon="tabler:trash"
              :loading="isDeleting"
              @click="confirmDelete"
            >
              {{ $t('dashboard.photos.delete.buttons.confirm') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- LivePhoto 预览模态框 -->
    <UModal v-model:open="isLivePhotoModalOpen">
      <template #content>
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">
              {{ $t('dashboard.photos.livePhotoModal.title', { title: selectedLivePhoto?.title || 'Untitled' }) }}
            </h3>
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="tabler:x"
              @click="isLivePhotoModalOpen = false"
            />
          </div>

          <div
            v-if="selectedLivePhoto"
            class="space-y-4"
          >
            <!-- 静态图片预览 -->
            <div class="space-y-2">
              <h4 class="font-medium text-sm text-gray-600 dark:text-gray-400">
                {{ $t('dashboard.photos.livePhotoModal.staticImage') }}
              </h4>
              <div
                class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 flex justify-center"
              >
                <img
                  :src="selectedLivePhoto.originalUrl"
                  :alt="selectedLivePhoto.title || 'Live Photo'"
                  class="max-h-64 object-contain rounded"
                />
              </div>
            </div>

            <!-- 视频预览 -->
            <div class="space-y-2">
              <h4 class="font-medium text-sm text-gray-600 dark:text-gray-400">
                {{ $t('dashboard.photos.livePhotoModal.livePhotoVideo') }}
              </h4>
              <div
                class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 flex justify-center"
              >
                <video
                  :src="selectedLivePhoto.videoUrl"
                  controls
                  autoplay
                  loop
                  muted
                  class="max-h-64 object-contain rounded"
                >
                  {{ $t('dashboard.photos.livePhotoModal.notSupported') }}
                </video>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex justify-end gap-2 pt-4 border-t">
              <UButton
                variant="ghost"
                color="neutral"
                icon="tabler:external-link"
                @click="
                  () => {
                    if (selectedLivePhoto)
                      openInNewTab(selectedLivePhoto.videoUrl)
                  }
                "
              >
                {{ $t('dashboard.photos.livePhotoModal.buttons.openVideo') }}
              </UButton>
              <UButton
                variant="soft"
                color="info"
                icon="tabler:download"
                @click="
                  () => {
                    if (selectedLivePhoto)
                      openInNewTab(selectedLivePhoto.videoUrl)
                  }
                "
              >
                {{ $t('dashboard.photos.livePhotoModal.buttons.downloadVideo') }}
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped></style>
