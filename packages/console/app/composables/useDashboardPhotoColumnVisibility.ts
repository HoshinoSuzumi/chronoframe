import { useLocalStorage } from '@vueuse/core'

const DASHBOARD_PHOTO_COLUMN_VISIBILITY_STORAGE_KEY =
  'dashboard-photos-column-visibility'

export const DASHBOARD_PHOTO_COLUMN_IDS = [
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

type DashboardPhotoColumnId = (typeof DASHBOARD_PHOTO_COLUMN_IDS)[number]
type DashboardPhotoColumnVisibility = Record<DashboardPhotoColumnId, boolean>

function createDefaultColumnVisibility(): DashboardPhotoColumnVisibility {
  return Object.fromEntries(
    DASHBOARD_PHOTO_COLUMN_IDS.map((columnId) => [columnId, true]),
  ) as DashboardPhotoColumnVisibility
}

function mergeColumnVisibility(
  storageValue: DashboardPhotoColumnVisibility,
  defaults: DashboardPhotoColumnVisibility,
  locked: readonly DashboardPhotoColumnId[] = lockedVisibleColumnIds,
): DashboardPhotoColumnVisibility {
  const merged: DashboardPhotoColumnVisibility = { ...defaults }

  if (
    !storageValue ||
    typeof storageValue !== 'object' ||
    Array.isArray(storageValue)
  ) {
    return merged
  }

  for (const columnId of DASHBOARD_PHOTO_COLUMN_IDS) {
    const value = storageValue[columnId]
    if (typeof value === 'boolean') {
      merged[columnId] = value
    }
  }

  for (const columnId of locked) {
    merged[columnId] = true
  }

  return merged
}

export function useDashboardPhotoColumnVisibility(
  options: {
    storageKey?: string
    hidden?: readonly DashboardPhotoColumnId[]
    locked?: readonly DashboardPhotoColumnId[]
  } = {},
) {
  return useLocalStorage<DashboardPhotoColumnVisibility>(
    options.storageKey ?? DASHBOARD_PHOTO_COLUMN_VISIBILITY_STORAGE_KEY,
    () => ({
      ...createDefaultColumnVisibility(),
      ...Object.fromEntries((options.hidden ?? []).map((id) => [id, false])),
    }),
    {
      mergeDefaults: (stored, defaults) =>
        mergeColumnVisibility(stored, defaults, options.locked),
      initOnMounted: true,
    },
  )
}
