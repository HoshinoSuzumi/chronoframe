interface SortOption {
  key: string
  labelI18n: string
  icon?: string
  value: (photo: Photo) => any
  order: 'asc' | 'desc'
}

// 全局排序状态
const sortOptions: readonly SortOption[] = [
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
    key: 'lastModified-desc',
    labelI18n: 'ui.action.sort.options.lastModifiedDesc',
    icon: 'tabler:sort-descending',
    value: (photo: Photo) =>
      photo.lastModified ? new Date(photo.lastModified).getTime() : 0,
    order: 'desc',
  },
  {
    key: 'lastModified-asc',
    labelI18n: 'ui.action.sort.options.lastModifiedAsc',
    icon: 'tabler:sort-ascending',
    value: (photo: Photo) =>
      photo.lastModified ? new Date(photo.lastModified).getTime() : 0,
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
]

const shuffleOption: SortOption = {
  key: 'shuffle',
  labelI18n: 'ui.action.sort.options.shuffle',
  icon: 'tabler:dice-3',
  value: () => Math.random(),
  order: 'asc',
}

export function usePhotoSort() {
  const { photos } = usePhotos()
  const currentSort = useState<string>(
    `photo-sort:${useEntryContext().value?.scope ?? 'self-hosted'}`,
    () => 'dateTaken-desc',
  )

  const availableSorts = computed(() =>
    currentSort.value === 'shuffle'
      ? [...sortOptions, shuffleOption]
      : sortOptions,
  )

  // 当前排序选项
  const currentSortOption = computed(() => {
    return (
      availableSorts.value.find((sort) => sort.key === currentSort.value) ||
      sortOptions[0]
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
    if (availableSorts.value.some((sort) => sort.key === sortKey)) {
      currentSort.value = sortKey
    }
  }

  // 切换时间排序（正序/倒序）
  const toggleDateSortOrder = () => {
    const current = currentSort.value
    if (current === 'dateTaken-desc') {
      setSortOption('dateTaken-asc')
    } else {
      setSortOption('dateTaken-desc')
    }
  }

  // 获取当前排序的显示标签
  const currentSortLabel = computed(
    () =>
      currentSortOption.value?.labelI18n ||
      'ui.action.sort.options.dateTakenDesc',
  )

  // 获取当前排序的显示图标
  const currentSortIcon = computed(
    () => currentSortOption.value?.icon || 'tabler:sort-descending',
  )

  // 检查是否为时间排序
  const isDateSort = computed(() => {
    return currentSort.value.startsWith('dateTaken')
  })

  // 检查时间排序是否为倒序
  const isDateSortDesc = computed(() => {
    return currentSort.value === 'dateTaken-desc'
  })

  // 打乱照片顺序
  const shufflePhotos = () => {
    // 创建一个特殊的排序方式用于打乱
    currentSort.value = 'shuffle'
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
