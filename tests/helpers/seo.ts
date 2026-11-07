import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'

/** Cancellation must not release fixture cleanup while a child is still running. */
export async function waitForChildExit(
  child: ChildProcess,
  signal: AbortSignal,
) {
  const exited = once(child, 'exit')
  let forceKill: NodeJS.Timeout | undefined
  const terminate = () => {
    child.kill('SIGTERM')
    forceKill = setTimeout(() => child.kill('SIGKILL'), 5000)
    forceKill.unref()
  }
  signal.addEventListener('abort', terminate, { once: true })
  try {
    if (signal.aborted) terminate()
    const result = await exited
    signal.throwIfAborted()
    return result
  } finally {
    signal.removeEventListener('abort', terminate)
    clearTimeout(forceKill)
  }
}

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
