import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { getEventListeners, once } from 'node:events'
import test from 'node:test'
import { imageUrl, waitForChildExit } from './helpers/seo.ts'

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
}

test('child exit waiting preserves normal exit status and removes cancellation listeners', async () => {
  const controller = new AbortController()
  const child = spawn(process.execPath, ['-e', 'process.exit(7)'])
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
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
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
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
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
  'cancellation force-kills a child that ignores graceful termination',
  { timeout: 10_000 },
  async (t) => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
process.send('ready')
setInterval(() => {}, 1000)
`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
    )
    t.after(() => stop(child))
    // Simulate ignored SIGTERM portably; Windows cannot install POSIX handlers.
    const kill = child.kill.bind(child)
    t.mock.method(child, 'kill', (signal?: NodeJS.Signals | number) =>
      signal === 'SIGTERM' ? true : kill(signal),
    )
    await once(child, 'message')
    const controller = new AbortController()
    const reason = new Error('Fixture cancelled')
    const waiting = waitForChildExit(child, controller.signal)
    const rejected = assert.rejects(waiting, (error) => error === reason)
    controller.abort(reason)
    await rejected
    assert.equal(child.signalCode, 'SIGKILL')
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
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
