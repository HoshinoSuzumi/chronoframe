import { useLocalStorage } from '@vueuse/core'

const DASHBOARD_PHOTO_COLUMN_VISIBILITY_STORAGE_KEY =
  'dashboard-photos-column-visibility'

const dashboardPhotoColumnIds = [
  'thumbnailUrl',
  'id',
  'actions',
  'title',
  'tags',
  'rating',
  'isLivePhoto',
  'location',
  'dateTaken',
  'lastModified',
  'fileSize',
  'colorSpace',
  'reactions',
] as const

const lockedVisibleColumnIds = ['thumbnailUrl', 'id', 'actions'] as const

type DashboardPhotoColumnId = (typeof dashboardPhotoColumnIds)[number]
type DashboardPhotoColumnVisibility = Record<DashboardPhotoColumnId, boolean>

function createDefaultColumnVisibility(): DashboardPhotoColumnVisibility {
  return Object.fromEntries(
    dashboardPhotoColumnIds.map((columnId) => [columnId, true]),
  ) as DashboardPhotoColumnVisibility
}

function mergeColumnVisibility(
  storageValue: DashboardPhotoColumnVisibility,
  defaults: DashboardPhotoColumnVisibility,
): DashboardPhotoColumnVisibility {
  const merged: DashboardPhotoColumnVisibility = { ...defaults }

  if (
    !storageValue ||
    typeof storageValue !== 'object' ||
    Array.isArray(storageValue)
  ) {
    return merged
  }

  for (const columnId of dashboardPhotoColumnIds) {
    const value = storageValue[columnId]
    if (typeof value === 'boolean') {
      merged[columnId] = value
    }
  }

  for (const columnId of lockedVisibleColumnIds) {
    merged[columnId] = true
  }

  return merged
}

export function useDashboardPhotoColumnVisibility() {
  return useLocalStorage<DashboardPhotoColumnVisibility>(
    DASHBOARD_PHOTO_COLUMN_VISIBILITY_STORAGE_KEY,
    createDefaultColumnVisibility,
    {
      mergeDefaults: mergeColumnVisibility,
      initOnMounted: true,
    },
  )
}
