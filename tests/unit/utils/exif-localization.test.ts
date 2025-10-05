import { describe, it, expect, vi } from 'vitest'
import { toCamelCaseKey, translateExifValue } from '~/utils/exif-localization'

describe('utils/exif-localization', () => {
  describe('toCamelCaseKey', () => {
    it('converts labels with punctuation to camelCase keys', () => {
      expect(toCamelCaseKey('F/2.8 Lens (Test)!')).toBe('f28LensTest')
    })

    it('handles multiple spaces and mixed casing', () => {
      expect(toCamelCaseKey('  Multi   WORD   Value ')).toBe('multiWordValue')
    })
  })

  describe('translateExifValue', () => {
    it('returns empty string when value is missing', () => {
      const t = vi.fn()
      expect(translateExifValue('colorSpace', undefined, t)).toBe('')
      expect(t).not.toHaveBeenCalled()
    })

    it('delegates to the translation function with computed key', () => {
      const t = vi.fn((key: string) => `translated:${key}`)
      const result = translateExifValue('colorSpace', 'sRGB', t)

      expect(t).toHaveBeenCalledTimes(1)
      expect(t).toHaveBeenCalledWith('exif.values.colorSpace.srgb')
      expect(result).toBe('translated:exif.values.colorSpace.srgb')
    })
  })
})
