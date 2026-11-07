import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'

export async function unusedPort() {
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  assert.ok(address && typeof address !== 'string')
  listener.close()
  await once(listener, 'close')
  return address.port
}

export function imageUrl(html: string) {
  const tag = html.match(/<meta\b[^>]*property="og:image"[^>]*>/)?.[0]
  const value = tag?.match(/content="([^"]+)"/)?.[1]
  assert.ok(value, 'SSR must include an OG image')
  // Decode ampersands last so escaped entity text is not decoded twice.
  return value.replaceAll('&#x2F;', '/').replaceAll('&amp;', '&')
}
