import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useExifLocalization } from '~/composables/useExifLocalization'

describe('composables/useExifLocalization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('localizeExif', () => {
    it('delegates to the Nuxt i18n translator when a value is provided', () => {
      const t = vi.fn((key: string) => `translated:${key}`)
      mockNuxtImport('useNuxtApp', () => ({ $i18n: { t } }))

      const { localizeExif } = useExifLocalization()
      const result = localizeExif('colorSpace', 'sRGB')

      expect(t).toHaveBeenCalledWith('exif.values.colorSpace.srgb')
      expect(result).toBe('translated:exif.values.colorSpace.srgb')
    })

    it('returns an empty string without calling the translator when value is missing', () => {
      const t = vi.fn()
      mockNuxtImport('useNuxtApp', () => ({ $i18n: { t } }))

      const { localizeExif } = useExifLocalization()
      const result = localizeExif('colorSpace', undefined)

      expect(result).toBe('')
      expect(t).not.toHaveBeenCalled()
    })
  })
})
