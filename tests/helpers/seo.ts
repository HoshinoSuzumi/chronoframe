import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

/** Spawn with detached: true on POSIX so descendants share an isolated group. */
export async function waitForChildExit(
  child: ChildProcess,
  signal: AbortSignal,
) {
  // Unlike exit, close waits for inherited stdout/stderr handles to be released.
  const closed = once(child, 'close')
  const group =
    process.platform !== 'win32' && child.pid ? -child.pid : undefined
  const signalGroup = (signal: NodeJS.Signals | 0) => {
    if (group === undefined) return false
    try {
      process.kill(group, signal)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      return false
    }
  }
  let forceKill: NodeJS.Timeout | undefined
  let windowsTermination: Promise<unknown> | undefined
  const terminate = () => {
    if (process.platform === 'win32' && child.pid) {
      // Windows has no POSIX process groups or graceful SIGTERM semantics.
      windowsTermination = once(
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
        }),
        'close',
      )
      // Observe launch errors immediately; propagate them when awaiting shutdown.
      windowsTermination.catch(() => {})
    } else {
      signalGroup('SIGTERM')
      forceKill = setTimeout(() => signalGroup('SIGKILL'), 5000)
      forceKill.unref()
    }
  }
  signal.addEventListener('abort', terminate, { once: true })
  try {
    if (signal.aborted) terminate()
    const result = await closed
    // A descendant can close its pipes yet still be using the fixture directory.
    while (signalGroup(0)) await delay(25)
    await windowsTermination
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
