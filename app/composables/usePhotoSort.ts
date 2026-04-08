interface SortOption {
  key: string
  labelI18n: string
  icon?: string
  value: (photo: Photo) => any
  order: 'asc' | 'desc'
}

interface SortState {
  currentSort: string
  availableSorts: SortOption[]
}

// 全局排序状态
const globalSortState = ref<SortState>({
  currentSort: 'dateTaken-desc', // 默认按拍摄时间倒序
  availableSorts: [
    {
      key: 'dateTaken-desc',
      labelI18n: 'ui.action.sort.options.dateTakenDesc',
      icon: 'tabler:sort-descending',
      value: (photo: Photo) =>
        photo.dateTaken ? new Date(photo.dateTaken).getTime() : 0,
      order: 'desc',
    },
    {
      key: 'dateTaken-asc',
      labelI18n: 'ui.action.sort.options.dateTakenAsc',
      icon: 'tabler:sort-ascending',
      value: (photo: Photo) =>
        photo.dateTaken ? new Date(photo.dateTaken).getTime() : 0,
      order: 'asc',
    },
    {
      key: 'fileSize-asc',
      labelI18n: 'ui.action.sort.options.fileSizeAsc',
      icon: 'tabler:sort-ascending-small-big',
      value: (photo: Photo) => photo.fileSize || 0,
      order: 'asc',
    },
    {
      key: 'fileSize-desc',
      labelI18n: 'ui.action.sort.options.fileSizeDesc',
      icon: 'tabler:sort-descending-small-big',
      value: (photo: Photo) => photo.fileSize || 0,
      order: 'desc',
    },
    {
      key: 'title-asc',
      labelI18n: 'ui.action.sort.options.titleAsc',
      icon: 'tabler:sort-ascending-letters',
      value: (photo: Photo) => (photo.title || photo.id).toLowerCase(),
      order: 'asc',
    },
    {
      key: 'title-desc',
      labelI18n: 'ui.action.sort.options.titleDesc',
      icon: 'tabler:sort-descending-letters',
      value: (photo: Photo) => (photo.title || photo.id).toLowerCase(),
      order: 'desc',
    },
  ],
})

export function usePhotoSort() {
  const { photos } = usePhotos()

  // 当前排序选项
  const currentSortOption = computed(() => {
    return (
      globalSortState.value.availableSorts.find(
        (sort) => sort.key === globalSortState.value.currentSort,
      ) || globalSortState.value.availableSorts[0]
    )
  })

  // 排序后的照片
  const sortedPhotos = computed(() => {
    const option = currentSortOption.value
    if (!option) return photos.value

    const sorted = [...photos.value].sort((a, b) => {
      const valueA = option.value(a)
      const valueB = option.value(b)

      // 处理 null/undefined 值
      if (valueA == null && valueB == null) return 0
      if (valueA == null) return 1
      if (valueB == null) return -1

      // 数值比较
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return option.order === 'asc' ? valueA - valueB : valueB - valueA
      }

      // 字符串比较
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        const comparison = valueA.localeCompare(valueB)
        return option.order === 'asc' ? comparison : -comparison
      }

      // 其他类型转字符串比较
      const strA = String(valueA)
      const strB = String(valueB)
      const comparison = strA.localeCompare(strB)
      return option.order === 'asc' ? comparison : -comparison
    })

    return sorted
  })

  // 设置排序方式
  const setSortOption = (sortKey: string) => {
    if (
      globalSortState.value.availableSorts.some((sort) => sort.key === sortKey)
    ) {
      globalSortState.value.currentSort = sortKey
    }
  }

  // 切换时间排序（正序/倒序）
  const toggleDateSortOrder = () => {
    const current = globalSortState.value.currentSort
    if (current === 'dateTaken-desc') {
      setSortOption('dateTaken-asc')
    } else {
      setSortOption('dateTaken-desc')
    }
  }

  // 获取可用的排序选项
  const availableSorts = computed(() => globalSortState.value.availableSorts)

  // 获取当前排序的显示标签
  const currentSortLabel = computed(
    () => currentSortOption.value?.labelI18n || '拍摄时间（新到旧）',
  )

  // 获取当前排序的显示图标
  const currentSortIcon = computed(
    () => currentSortOption.value?.icon || 'tabler:sort-descending',
  )

  // 检查是否为时间排序
  const isDateSort = computed(() => {
    return globalSortState.value.currentSort.startsWith('dateTaken')
  })

  // 检查时间排序是否为倒序
  const isDateSortDesc = computed(() => {
    return globalSortState.value.currentSort === 'dateTaken-desc'
  })

  // 打乱照片顺序
  const shufflePhotos = () => {
    // 创建一个特殊的排序方式用于打乱
    globalSortState.value.currentSort = 'shuffle'

    // 更新可用排序中的 shuffle 选项
    const shuffleIndex = globalSortState.value.availableSorts.findIndex(
      (sort) => sort.key === 'shuffle',
    )

    if (shuffleIndex === -1) {
      // 如果没有 shuffle 排序选项，则添加它
      globalSortState.value.availableSorts.push({
        key: 'shuffle',
        labelI18n: 'ui.action.sort.options.shuffle',
        icon: 'tabler:dice-3',
        value: () => Math.random(),
        order: 'asc',
      })
    }
  }

  return {
    sortedPhotos,
    currentSortOption: readonly(currentSortOption),
    currentSortLabel,
    currentSortIcon,
    availableSorts,
    isDateSort,
    isDateSortDesc,
    setSortOption,
    toggleDateSortOrder,
    shufflePhotos,
  }
}
