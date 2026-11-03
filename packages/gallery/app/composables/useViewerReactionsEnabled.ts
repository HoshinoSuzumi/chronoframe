import { computed, watch, type Ref, type WatchStopHandle } from 'vue'

/** Missing/null public setting means reactions stay enabled for legacy galleries. */
export function isReactionsEnabledSetting(value: unknown): boolean {
  return value !== false
}

/** Reactive public `app:reactionsEnabled` preference for the photo viewer. */
export function useViewerReactionsEnabled() {
  const setting = useSettingRef('app:reactionsEnabled')
  return computed(() => isReactionsEnabledSetting(setting.value))
}

/**
 * Load reaction data only while enabled; clear transient UI when disabled.
 * Re-enabling for the current photo reloads counts without keeping stale state.
 */
export function bindViewerReactionsAvailability(options: {
  reactionsEnabled: Ref<boolean>
  photoId: Ref<string | null | undefined>
  load: (photoId: string) => void | Promise<void>
  clearTransient: () => void
}): WatchStopHandle {
  return watch(
    [options.reactionsEnabled, options.photoId],
    ([enabled, photoId]) => {
      if (!enabled) {
        options.clearTransient()
        return
      }
      if (photoId) void options.load(photoId)
    },
    { immediate: true },
  )
}
