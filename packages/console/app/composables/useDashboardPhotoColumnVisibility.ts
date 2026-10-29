import { useLocalStorage } from '@vueuse/core'
import { onMounted } from 'vue'

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
    legacyStorageKey?: string
    hidden?: readonly DashboardPhotoColumnId[]
    locked?: readonly DashboardPhotoColumnId[]
  } = {},
) {
  const key =
    options.storageKey ?? DASHBOARD_PHOTO_COLUMN_VISIBILITY_STORAGE_KEY
  const defaults = () => ({
    ...createDefaultColumnVisibility(),
    ...Object.fromEntries((options.hidden ?? []).map((id) => [id, false])),
  })
  // Register before useLocalStorage's mounted read so migration precedes initialization.
  const legacyKey = options.legacyStorageKey
  if (legacyKey)
    onMounted(() => {
      try {
        const storage = window.localStorage
        if (storage.getItem(key) !== null) return
        const raw = storage.getItem(legacyKey)
        if (raw === null) return
        const legacy = JSON.parse(raw)
        if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy))
          return
        const migrated = mergeColumnVisibility(
          {
            ...legacy,
            ...Object.fromEntries(
              (options.hidden ?? []).map((id) => [id, false]),
            ),
          },
          defaults(),
          options.locked,
        )
        storage.setItem(key, JSON.stringify(migrated))
      } catch {
        // Invalid legacy data or unavailable storage must not prevent opening the library.
      }
    })
  return useLocalStorage<DashboardPhotoColumnVisibility>(key, defaults, {
    mergeDefaults: (stored, defaults) =>
      mergeColumnVisibility(stored, defaults, options.locked),
    initOnMounted: true,
  })
}
