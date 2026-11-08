import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
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
  let windowsFailure: unknown
  const terminationFailure = Promise.withResolvers<never>()
  const terminate = () => {
    if (process.platform === 'win32' && child.pid) {
      // Windows has no POSIX process groups or graceful SIGTERM semantics.
      windowsTermination = Promise.resolve().then(async () => {
        const [code] = await once(
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
          }),
          'close',
        )
        if (code !== 0)
          throw Object.assign(new Error(`taskkill exited with code ${code}`), {
            code,
          })
      })
      windowsTermination.catch((error) => {
        windowsFailure = error
        terminationFailure.reject(error)
      })
    } else {
      signalGroup('SIGTERM')
      forceKill = setTimeout(() => signalGroup('SIGKILL'), 5000)
      forceKill.unref()
    }
  }
  signal.addEventListener('abort', terminate, { once: true })
  try {
    if (signal.aborted) terminate()
    const result = await Promise.race([closed, terminationFailure.promise])
    // A descendant can close its pipes yet still be using the fixture directory.
    // Signal 0 also succeeds for unreaped zombies, which no longer execute.
    while (
      group !== undefined &&
      signalGroup(0) &&
      (await activeProcesses()).some((member) => member.group === -group)
    )
      await delay(25)
    await windowsTermination
    signal.throwIfAborted()
    return result
  } catch (error) {
    if (windowsFailure !== undefined && error === windowsFailure) {
      // Tree shutdown failed: release this parent's handles, then let the caller
      // report the failure and retain the fixture for any surviving descendants.
      try {
        if (!child.kill('SIGKILL')) child.unref()
      } catch {
        // Preserve the taskkill error even if direct parent termination fails.
        child.unref()
      } finally {
        child.stdout?.destroy()
        child.stderr?.destroy()
        if (child.connected) child.disconnect()
      }
    }
    throw error
  } finally {
    signal.removeEventListener('abort', terminate)
    clearTimeout(forceKill)
  }
}

/** POSIX process snapshot: stopped/sleeping processes still count; zombies do not. */
export async function activeProcesses() {
  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      'ps',
      ['-A', '-o', 'pid=,pgid=,stat='],
      { encoding: 'utf8', timeout: 1000 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
  })
  return output
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      const fields = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s*$/)
      assert.ok(fields, 'ps must report each process PID, group and state')
      return fields[3].startsWith('Z')
        ? []
        : [{ pid: Number(fields[1]), group: Number(fields[2]) }]
    })
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
