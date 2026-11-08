import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'

const FORCE_KILL_MS = 5000

/** Spawn with detached: true on POSIX so descendants share an isolated group. */
export async function waitForChildExit(
  child: ChildProcess,
  signal: AbortSignal,
) {
  // Unlike exit, close waits for inherited stdout/stderr handles to be released.
  const closed = once(child, 'close')
  const group =
    process.platform !== 'win32' && child.pid ? -child.pid : undefined
  let forceKill: NodeJS.Timeout | undefined

  const signalGroup = (value: NodeJS.Signals) => {
    if (group === undefined) return
    try {
      process.kill(group, value)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }

  const terminate = () => {
    if (process.platform === 'win32') {
      try {
        child.kill()
      } catch {
        // Already exited.
      }
      forceKill = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // Already exited.
        }
      }, FORCE_KILL_MS)
      forceKill.unref()
      return
    }
    signalGroup('SIGTERM')
    forceKill = setTimeout(() => signalGroup('SIGKILL'), FORCE_KILL_MS)
    forceKill.unref()
  }

  signal.addEventListener('abort', terminate, { once: true })
  try {
    if (signal.aborted) terminate()
    const result = await closed
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
