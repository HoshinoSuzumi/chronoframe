export interface AccountProfile {
  name: string
  image: string | null
}
export function parseAccountProfile(value: unknown): AccountProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid profile')
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some((key) => !['name', 'image'].includes(key)) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.trim().length > 80 ||
    [...input.name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Invalid nickname')
  if (input.image !== null && typeof input.image !== 'string')
    throw new Error('Invalid avatar')
  const image = typeof input.image === 'string' ? input.image.trim() : ''
  if (image && image.startsWith('data:')) {
    if (
      image.length > 65536 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
    )
      throw new Error('Invalid avatar image')
    const body = atob(image.slice(image.indexOf(',') + 1))
    const valid = image.startsWith('data:image/png;')
      ? body.startsWith('\x89PNG\r\n\x1a\n')
      : image.startsWith('data:image/jpeg;')
        ? body.startsWith('\xff\xd8\xff')
        : body.startsWith('RIFF') && body.slice(8, 12) === 'WEBP'
    if (!valid) throw new Error('Invalid avatar image')
  } else if (image) {
    if (image.length > 2048) throw new Error('Avatar URL too long')
    const url = new URL(image)
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Use an HTTPS avatar URL')
  }
  return { name: input.name.trim(), image: image || null }
}
