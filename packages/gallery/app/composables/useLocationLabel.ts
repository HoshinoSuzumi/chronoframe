import { toValue, type MaybeRefOrGetter } from 'vue'
import {
  resolveLocationLabel,
  defaultLocationFallback,
} from '@chronoframe/gallery/shared/utils/location'
import type { NormalizedLocation } from '@chronoframe/gallery/shared/types/location'

export function useLocationLabel(
  overrides: MaybeRefOrGetter<{
    preferredLevel?: string
    fallbackOrder?: string
  }> = {},
) {
  const settings = useSettingsStore()
  return (photo: {
    geocoding?: NormalizedLocation | null
    city?: string | null
  }) =>
    resolveLocationLabel(
      photo,
      toValue(overrides).preferredLevel ??
        String(settings.getSetting('location:preferredLevel') || 'city'),
      toValue(overrides).fallbackOrder ??
        String(
          settings.getSetting('location:fallbackOrder') ||
            defaultLocationFallback,
        ),
    ).label
}
