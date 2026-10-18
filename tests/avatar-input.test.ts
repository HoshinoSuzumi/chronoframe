import { describe, expect, it } from 'vitest'
import { getAvatarInputType } from '../app/utils/avatar'

describe('getAvatarInputType', () => {
  it('treats saved uploaded avatar paths as text input', () => {
    expect(getAvatarInputType('/avatar/avatar-0123456789abcdef.webp')).toBe(
      'text',
    )
  })

  it('treats external URLs as url input', () => {
    expect(getAvatarInputType('https://example.com/a.png')).toBe('url')
    expect(getAvatarInputType(null)).toBe('url')
    expect(getAvatarInputType('')).toBe('url')
  })
})
