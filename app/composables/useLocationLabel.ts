import {
  resolveLocationLabel,
  defaultLocationFallback,
} from '~~/shared/utils/location'
import type { NormalizedLocation } from '~~/shared/types/location'

export function useLocationLabel() {
  const settings = useSettingsStore()
  return (photo: {
    geocoding?: NormalizedLocation | null
    city?: string | null
  }) =>
    resolveLocationLabel(
      photo,
      String(settings.getSetting('location:preferredLevel') || 'city'),
      String(
        settings.getSetting('location:fallbackOrder') ||
          defaultLocationFallback,
      ),
    ).label
}
