import { describe, it, expect } from 'vitest'
import { formatCameraInfo, formatLensInfo } from '~/utils/camera'

describe('utils/camera', () => {
  describe('formatCameraInfo', () => {
    it('returns empty string when make and model are missing', () => {
      expect(formatCameraInfo()).toBe('')
    })

    it('returns model when make is missing', () => {
      expect(formatCameraInfo(undefined, 'ILCE-7M3')).toBe('ILCE-7M3')
    })

    it('returns make when model is missing', () => {
      expect(formatCameraInfo('Fujifilm')).toBe('Fujifilm')
    })

    it('avoids duplicating the brand when model already contains it', () => {
      expect(formatCameraInfo('Sony', 'ILCE-7M3')).toBe('ILCE-7M3')
      expect(formatCameraInfo('Canon', 'EOS R5')).toBe('EOS R5')
    })

    it('combines make and model when model lacks brand information', () => {
      expect(formatCameraInfo('Fujifilm', 'X-T5')).toBe('Fujifilm X-T5')
    })
  })

  describe('formatLensInfo', () => {
    it('returns empty string when lens make and model are missing', () => {
      expect(formatLensInfo()).toBe('')
    })

    it('returns lens model when make is missing', () => {
      expect(formatLensInfo(undefined, 'XF 23mm F1.4')).toBe('XF 23mm F1.4')
    })

    it('returns lens make when model is missing', () => {
      expect(formatLensInfo('Sigma')).toBe('Sigma')
    })

    it('avoids duplicating the lens brand when model already contains it', () => {
      expect(formatLensInfo('Canon', 'EF 24-70mm f/2.8L II USM')).toBe('EF 24-70mm f/2.8L II USM')
      expect(formatLensInfo('Sony', 'FE 35mm F1.4 GM')).toBe('FE 35mm F1.4 GM')
    })

    it('combines lens make and model when model lacks brand information', () => {
      expect(formatLensInfo('Tamron', '28-75mm F/2.8 Di III RXD')).toBe('Tamron 28-75mm F/2.8 Di III RXD')
    })
  })
})
