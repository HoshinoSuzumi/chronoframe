import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { getEventListeners, once } from 'node:events'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { imageUrl, waitForChildExit } from './helpers/seo.ts'

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
}

test('child exit waiting preserves normal exit status and removes cancellation listeners', async () => {
  const controller = new AbortController()
  const child = spawn(process.execPath, ['-e', 'process.exit(7)'], {
    detached: process.platform !== 'win32',
  })
  try {
    const [code, signal] = await waitForChildExit(child, controller.signal)
    assert.equal(code, 7)
    assert.equal(signal, null)
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  } finally {
    await stop(child)
  }
})

test('cancellation terminates the child and waits for its exit before allowing cleanup', async () => {
  const controller = new AbortController()
  const reason = new Error('Fixture cancelled')
  const child = spawn(
    process.execPath,
    [
      '-e',
      `
process.send('ready')
setInterval(() => {}, 1000)
`,
    ],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  )
  const waiting = waitForChildExit(child, controller.signal).then(
    () => undefined,
    (error) => error,
  )
  let timeout: NodeJS.Timeout | undefined
  try {
    await once(child, 'message')
    controller.abort(reason)
    assert.equal(
      await Promise.race([
        waiting,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Child was not terminated')),
            3000,
          )
        }),
      ]),
      reason,
    )
    assert.ok(
      child.exitCode !== null || child.signalCode !== null,
      'cancellation must not race fixture cleanup ahead of child exit',
    )
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  } finally {
    clearTimeout(timeout)
    await stop(child)
    await waiting
  }
})

test('an already cancelled fixture terminates a newly spawned child before rejecting', async () => {
  const controller = new AbortController()
  const reason = new Error('Fixture already cancelled')
  controller.abort(reason)
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32',
  })
  let timeout: NodeJS.Timeout | undefined
  try {
    const waiting = waitForChildExit(child, controller.signal)
    await assert.rejects(
      Promise.race([
        waiting,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Child was not terminated')),
            1000,
          )
        }),
      ]),
      (error) => error === reason,
    )
    assert.ok(child.exitCode !== null || child.signalCode !== null)
  } finally {
    clearTimeout(timeout)
    await stop(child)
  }
})

test(
  'cancellation waits for build descendants and inherited stderr after the parent exits',
  { timeout: 12_000 },
  async () => {
    const grandchildCode = `
process.on('SIGTERM', () => {})
process.send(process.pid)
setInterval(() => {}, 1000)
`
    const descendantCode = `
const { spawn } = require('node:child_process')
process.on('SIGTERM', () => {})
const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildCode)}], {
  stdio: ['ignore', 'ignore', 2, 'ipc'],
})
child.once('message', pid => process.send([process.pid, pid]))
setInterval(() => {}, 1000)
`
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
const { spawn } = require('node:child_process')
const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], {
  stdio: ['ignore', 'ignore', 2, 'ipc'],
})
child.once('message', pids => process.send(pids))
setInterval(() => {}, 1000)
`,
      ],
      {
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      },
    )
    const controller = new AbortController()
    const reason = new Error('Fixture cancelled')
    let closed = false
    let settled = false
    child.once('close', () => {
      closed = true
    })
    child.stderr?.resume()
    const waiting = waitForChildExit(child, controller.signal).catch(
      (error) => {
        settled = true
        return error
      },
    )
    let descendants: number[] = []
    try {
      ;[descendants] = await once(child, 'message')
      const exited = once(child, 'exit')
      controller.abort(reason)
      await exited
      if (process.platform !== 'win32') {
        await delay(100)
        assert.equal(
          settled,
          false,
          'parent exit must not release fixture cleanup',
        )
      }
      assert.equal(await waiting, reason)
      assert.equal(
        closed,
        true,
        'descendants must release inherited stderr before cleanup',
      )
      for (const pid of descendants)
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
    } finally {
      // Keep a failing regression from leaking the deliberately stubborn children.
      for (const pid of descendants) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch (error) {
          assert.equal((error as NodeJS.ErrnoException).code, 'ESRCH')
        }
      }
      await stop(child)
      await waiting
    }
  },
)

test('OG image extraction decodes HTML entities in a URL once', () => {
  assert.equal(
    imageUrl(
      '<meta property="og:image" content="https:&#x2F;&#x2F;gallery.example.test/image.png?width=1200&amp;height=600">',
    ),
    'https://gallery.example.test/image.png?width=1200&height=600',
  )
})

test('OG image extraction preserves entity text protected by an escaped ampersand', () => {
  for (const [encoded, decoded] of [
    ['/image&amp;#x2F;name.png', '/image&#x2F;name.png'],
    [
      '/image.png?label=&amp;#x2F;&amp;next=1',
      '/image.png?label=&#x2F;&next=1',
    ],
    ['/image&amp;amp;name.png', '/image&amp;name.png'],
  ]) {
    assert.equal(
      imageUrl(`<meta property="og:image" content="${encoded}">`),
      decoded,
    )
  }
})
